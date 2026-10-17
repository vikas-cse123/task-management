const uri = process.env.TEST_MONGODB_URI?.trim() ?? '';

/** Whether a test MongoDB connection string was provided. */
export const hasTestDatabase = uri.length > 0;

/** Whether the configured test database supports multi-document transactions. */
export const hasTransactions = hasTestDatabase && process.env.TEST_MONGODB_TRANSACTIONS === 'true';
