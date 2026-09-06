// These tests write fixtures. Refuse every database except an explicitly
// selected local disposable database, before loading application modules.
const target = new URL(process.env.DATABASE_URL || "postgresql://invalid/");
if (process.env.PAYMENT_INTEGRATION_TEST !== "1" || target.hostname !== "127.0.0.1" || target.pathname !== "/merch_cto_payments_test") {
  throw new Error("Payment integration tests require the disposable local merch_cto_payments_test database");
}
delete process.env.FACTURASCRIPTS_SYNC_ENABLED;
