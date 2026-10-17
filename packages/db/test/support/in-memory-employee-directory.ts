import type { EmployeeDirectory, EmployeeSnapshot } from '../../src';

/**
 * In-memory {@link EmployeeDirectory} for tests.
 *
 * The database-backed directory is bound in the authentication step; until then
 * this keeps the assignment rules testable without duplicating identity.
 */
export class InMemoryEmployeeDirectory implements EmployeeDirectory {
  private readonly employees = new Map<string, EmployeeSnapshot>();

  add(snapshot: EmployeeSnapshot): this {
    this.employees.set(snapshot.id, snapshot);
    return this;
  }

  async findById(id: string): Promise<EmployeeSnapshot | null> {
    return this.employees.get(id) ?? null;
  }
}
