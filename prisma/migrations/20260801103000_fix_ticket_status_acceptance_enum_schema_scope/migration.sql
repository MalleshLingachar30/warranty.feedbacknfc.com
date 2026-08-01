-- Repair non-public schema deployments where the original acceptance-state
-- migration updated public."TicketStatus" instead of the active schema enum.
DO $$
DECLARE
    active_schema TEXT := current_schema();
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum enum_values
        JOIN pg_type enum_types ON enum_types.oid = enum_values.enumtypid
        JOIN pg_namespace enum_namespaces ON enum_namespaces.oid = enum_types.typnamespace
        WHERE enum_namespaces.nspname = active_schema
          AND enum_types.typname = 'TicketStatus'
          AND enum_values.enumlabel = 'awaiting_technician_acceptance'
    ) THEN
        EXECUTE format(
            'ALTER TYPE %I."TicketStatus" ADD VALUE %L',
            active_schema,
            'awaiting_technician_acceptance'
        );
    END IF;
END $$;
