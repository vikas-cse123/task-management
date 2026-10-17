import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  connectToDatabase,
  createClientRecord,
  createProjectRecord,
  disconnectFromDatabase,
  listJobRoles,
  MongoEmployeeDirectory,
  mongoose,
  recordAudit,
  seedOfficialTemplates,
  seedReferenceData,
  upsertClientTeamMember,
} from '@interscale/db';
import { createAuth } from '../auth/auth';

/**
 * End-to-end test setup (Step 6, Playwright).
 *
 * Destroys and rebuilds an **isolated** database: drops it, seeds reference
 * data, bootstraps the Admin, creates fixture users and clients, and writes
 * `apps/web/e2e/fixtures.json` for the specs. The API server must already be
 * running against the same database (password changes go through HTTP so the
 * session/cookie behavior matches production).
 *
 * Never run against a real database: `E2E_ALLOW` must be set and the URI must
 * contain `interscale_e2e`.
 */

const API_BASE = process.env.E2E_API_BASE ?? 'http://127.0.0.1:4000';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'e2e.admin@test.local';
const ADMIN_NAME = process.env.E2E_ADMIN_NAME ?? 'E2E Admin';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'E2eAdminPass!2026';
const MANAGER_PASSWORD = 'E2eManager!2026';
const EMPLOYEE_PASSWORD = 'E2eEmployee!2026';

function temporaryPassword(): string {
  return `Temp-E2E-${randomBytes(4).toString('hex')}`;
}

interface ApiResponse {
  status: number;
  data: unknown;
  cookies: string[];
}

async function api(
  path: string,
  options: { method?: string; body?: unknown; cookie?: string } = {},
): Promise<ApiResponse> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const rawCookies =
    typeof (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie ===
    'function'
      ? (response.headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
      : [];

  try {
    await response.json();
  } catch {
    // Non-JSON bodies (e.g. empty responses) carry no fixture data.
  }

  return { status: response.status, data: null, cookies: rawCookies };
}

function cookieHeader(cookies: string[]): string {
  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
}

async function setPasswordViaHttp(
  email: string,
  temporary: string,
  permanent: string,
): Promise<void> {
  const signedIn = await api('/api/auth/sign-in/email', {
    method: 'POST',
    body: { email, password: temporary },
  });

  if (signedIn.status !== 200 || signedIn.cookies.length === 0) {
    throw new Error(`E2E setup sign-in failed for ${email} (status ${signedIn.status})`);
  }

  const changed = await api('/api/v1/me/change-password', {
    method: 'POST',
    body: { currentPassword: temporary, newPassword: permanent, revokeOtherSessions: true },
    cookie: cookieHeader(signedIn.cookies),
  });

  if (changed.status !== 200) {
    throw new Error(`E2E setup password change failed for ${email} (status ${changed.status})`);
  }
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI?.trim();

  if (process.env.E2E_ALLOW !== 'true' || !uri || !uri.includes('interscale_e2e')) {
    throw new Error(
      'Refusing to reset: set E2E_ALLOW=true and use an isolated MONGODB_URI containing "interscale_e2e".',
    );
  }

  await connectToDatabase(uri);

  const database = mongoose.connection.db;

  if (!database) {
    throw new Error('The MongoDB connection did not expose a database handle.');
  }

  await mongoose.connection.dropDatabase();
  await seedReferenceData();
  const templateSeeds = await seedOfficialTemplates();

  const hello = (await database.admin().command({ hello: 1 })) as { setName?: string };
  const auth = createAuth({
    database,
    client: mongoose.connection.getClient(),
    transactions: typeof hello.setName === 'string',
  });

  const admin = await auth.api.createUser({
    body: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      name: ADMIN_NAME,
      data: {
        accessLevel: 'Admin',
        status: 'active',
        requiresPasswordChange: false,
        jobRoleIds: [],
        capabilities: [],
        createdBy: null,
      },
    },
  });

  await recordAudit({
    actorId: null,
    action: 'user.create',
    entityType: 'user',
    entityId: admin.user.id,
    previousValue: null,
    newValue: { email: ADMIN_EMAIL, accessLevel: 'Admin', bootstrapped: true },
    notes: 'E2E setup bootstrap',
  });

  const roles = await listJobRoles();
  const [roleA, roleB] = roles;

  if (!roleA || !roleB) {
    throw new Error('E2E setup expected at least two seeded job roles.');
  }

  const roleKeyToId = new Map(roles.map((role) => [role.key, role.id]));

  function roleId(key: string): string {
    const id = roleKeyToId.get(key);

    if (!id) {
      throw new Error(`E2E setup expected seeded job role "${key}".`);
    }

    return id;
  }

  const managerTemp = temporaryPassword();
  const manager = await auth.api.createUser({
    body: {
      email: 'e2e.manager@test.local',
      password: managerTemp,
      name: 'E2E Manager',
      data: {
        accessLevel: 'Manager',
        status: 'active',
        requiresPasswordChange: true,
        jobRoleIds: [],
        capabilities: ['clients.manage', 'clients.team.manage', 'projects.create_from_template'],
        createdBy: admin.user.id,
      },
    },
  });

  const employeeTemp = temporaryPassword();
  const employee = await auth.api.createUser({
    body: {
      email: 'e2e.employee@test.local',
      password: employeeTemp,
      name: 'E2E Employee',
      data: {
        accessLevel: 'Employee',
        status: 'active',
        requiresPasswordChange: true,
        jobRoleIds: [roleA.id],
        capabilities: [],
        createdBy: admin.user.id,
      },
    },
  });

  const firstLoginTemp = temporaryPassword();
  const firstLogin = await auth.api.createUser({
    body: {
      email: 'e2e.firstlogin@test.local',
      password: firstLoginTemp,
      name: 'E2E First Login',
      data: {
        accessLevel: 'Employee',
        status: 'active',
        requiresPasswordChange: true,
        jobRoleIds: [],
        capabilities: [],
        createdBy: admin.user.id,
      },
    },
  });

  const editorTemp = temporaryPassword();
  const editor = await auth.api.createUser({
    body: {
      email: 'e2e.editor@test.local',
      password: editorTemp,
      name: 'E2E Editor',
      data: {
        accessLevel: 'Employee',
        status: 'active',
        requiresPasswordChange: true,
        jobRoleIds: [roleB.id],
        capabilities: [],
        createdBy: admin.user.id,
      },
    },
  });

  const marketerTemp = temporaryPassword();
  const marketer = await auth.api.createUser({
    body: {
      email: 'e2e.marketer@test.local',
      password: marketerTemp,
      name: 'E2E Marketer',
      data: {
        accessLevel: 'Employee',
        status: 'active',
        requiresPasswordChange: true,
        jobRoleIds: [roleA.id],
        capabilities: [],
        createdBy: admin.user.id,
      },
    },
  });

  const unassignedTemp = temporaryPassword();
  const unassigned = await auth.api.createUser({
    body: {
      email: 'e2e.unassigned@test.local',
      password: unassignedTemp,
      name: 'E2E Unassigned',
      data: {
        accessLevel: 'Employee',
        status: 'active',
        requiresPasswordChange: true,
        jobRoleIds: [],
        capabilities: [],
        createdBy: admin.user.id,
      },
    },
  });

  const performanceMarketerTemp = temporaryPassword();
  const performanceMarketer = await auth.api.createUser({
    body: {
      email: 'e2e.performance-marketer@test.local',
      password: performanceMarketerTemp,
      name: 'E2E Performance Marketer',
      data: {
        accessLevel: 'Employee',
        status: 'active',
        requiresPasswordChange: true,
        jobRoleIds: [roleId('performance_marketer')],
        capabilities: [],
        createdBy: admin.user.id,
      },
    },
  });

  const scriptWriterTemp = temporaryPassword();
  const scriptWriter = await auth.api.createUser({
    body: {
      email: 'e2e.script-writer@test.local',
      password: scriptWriterTemp,
      name: 'E2E Script Writer',
      data: {
        accessLevel: 'Employee',
        status: 'active',
        requiresPasswordChange: true,
        jobRoleIds: [roleId('video_ad_script_writer')],
        capabilities: [],
        createdBy: admin.user.id,
      },
    },
  });

  const videoEditorTemp = temporaryPassword();
  const videoEditor = await auth.api.createUser({
    body: {
      email: 'e2e.video-editor@test.local',
      password: videoEditorTemp,
      name: 'E2E Video Editor',
      data: {
        accessLevel: 'Employee',
        status: 'active',
        requiresPasswordChange: true,
        jobRoleIds: [roleId('video_editor')],
        capabilities: [],
        createdBy: admin.user.id,
      },
    },
  });

  await setPasswordViaHttp('e2e.manager@test.local', managerTemp, MANAGER_PASSWORD);
  await setPasswordViaHttp('e2e.employee@test.local', employeeTemp, EMPLOYEE_PASSWORD);
  await setPasswordViaHttp('e2e.unassigned@test.local', unassignedTemp, EMPLOYEE_PASSWORD);
  await setPasswordViaHttp('e2e.editor@test.local', editorTemp, EMPLOYEE_PASSWORD);
  await setPasswordViaHttp('e2e.marketer@test.local', marketerTemp, EMPLOYEE_PASSWORD);
  await setPasswordViaHttp(
    'e2e.performance-marketer@test.local',
    performanceMarketerTemp,
    EMPLOYEE_PASSWORD,
  );
  await setPasswordViaHttp('e2e.script-writer@test.local', scriptWriterTemp, EMPLOYEE_PASSWORD);
  await setPasswordViaHttp('e2e.video-editor@test.local', videoEditorTemp, EMPLOYEE_PASSWORD);

  const directory = new MongoEmployeeDirectory();
  const clientA = await createClientRecord(
    {
      name: 'E2E Client Alpha',
      status: 'active',
      primaryManagerId: manager.user.id,
    },
    admin.user.id,
    { directory },
  );
  const clientB = await createClientRecord(
    { name: 'E2E Client Beta', status: 'active' },
    admin.user.id,
    { directory },
  );

  // Phase 2 flow members on clientA (task assignment requires membership).
  const teamDeps = { directory };
  await upsertClientTeamMember(
    admin.user.id,
    clientA.id,
    employee.user.id,
    { isActive: true },
    teamDeps,
  );
  await upsertClientTeamMember(
    admin.user.id,
    clientA.id,
    editor.user.id,
    { isActive: true },
    teamDeps,
  );
  await upsertClientTeamMember(
    admin.user.id,
    clientA.id,
    marketer.user.id,
    { isActive: true },
    teamDeps,
  );
  await upsertClientTeamMember(
    admin.user.id,
    clientA.id,
    performanceMarketer.user.id,
    { isActive: true },
    teamDeps,
  );
  await upsertClientTeamMember(
    admin.user.id,
    clientA.id,
    scriptWriter.user.id,
    { isActive: true },
    teamDeps,
  );
  await upsertClientTeamMember(
    admin.user.id,
    clientA.id,
    videoEditor.user.id,
    { isActive: true },
    teamDeps,
  );

  const projectA = await createProjectRecord(
    {
      clientId: clientA.id,
      name: 'E2E Singapore Meta Ads Campaign',
      description: null,
      type: 'campaign',
      status: 'planned',
      managerId: manager.user.id,
      startAt: null,
      targetAt: null,
    },
    admin.user.id,
    { directory },
  );

  const here = dirname(fileURLToPath(import.meta.url));
  const fixturesPath = resolve(here, '../../../web/e2e/fixtures.json');
  mkdirSync(dirname(fixturesPath), { recursive: true });
  writeFileSync(
    fixturesPath,
    JSON.stringify(
      {
        admin: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
        manager: {
          email: 'e2e.manager@test.local',
          password: MANAGER_PASSWORD,
          userId: manager.user.id,
        },
        employee: {
          email: 'e2e.employee@test.local',
          password: EMPLOYEE_PASSWORD,
          userId: employee.user.id,
        },
        firstLogin: {
          email: 'e2e.firstlogin@test.local',
          tempPassword: firstLoginTemp,
          userId: firstLogin.user.id,
        },
        unassigned: {
          email: 'e2e.unassigned@test.local',
          password: EMPLOYEE_PASSWORD,
          userId: unassigned.user.id,
        },
        editor: {
          email: 'e2e.editor@test.local',
          password: EMPLOYEE_PASSWORD,
          userId: editor.user.id,
        },
        marketer: {
          email: 'e2e.marketer@test.local',
          password: EMPLOYEE_PASSWORD,
          userId: marketer.user.id,
        },
        performanceMarketer: {
          email: 'e2e.performance-marketer@test.local',
          password: EMPLOYEE_PASSWORD,
          userId: performanceMarketer.user.id,
        },
        scriptWriter: {
          email: 'e2e.script-writer@test.local',
          password: EMPLOYEE_PASSWORD,
          userId: scriptWriter.user.id,
        },
        videoEditor: {
          email: 'e2e.video-editor@test.local',
          password: EMPLOYEE_PASSWORD,
          userId: videoEditor.user.id,
        },
        clientA: { id: clientA.id, name: clientA.name },
        clientB: { id: clientB.id, name: clientB.name },
        projectA: { id: projectA.id, name: projectA.name },
        jobRoleA: { id: roleA.id, name: roleA.name },
        jobRoleB: { id: roleB.id, name: roleB.name },
        templates: {
          campaign: {
            id: templateSeeds.templateIds.destination_meta_ads_campaign ?? '',
            key: 'destination_meta_ads_campaign',
          },
          onboarding: {
            id: templateSeeds.templateIds.client_onboarding_technical_setup ?? '',
            key: 'client_onboarding_technical_setup',
          },
        },
      },
      null,
      2,
    ),
  );

  console.log(`E2E setup complete: fixtures written to ${fixturesPath}`);
}

main()
  .then(async () => {
    await disconnectFromDatabase();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    await disconnectFromDatabase().catch(() => undefined);
    process.exit(1);
  });
