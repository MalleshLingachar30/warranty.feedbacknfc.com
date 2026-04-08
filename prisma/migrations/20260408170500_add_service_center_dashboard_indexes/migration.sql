CREATE INDEX "idx_service_centers_organization" ON "service_centers"("organization_id");

CREATE INDEX "idx_technicians_service_center" ON "technicians"("service_center_id");

CREATE INDEX "idx_tickets_service_center" ON "tickets"("assigned_service_center_id");

CREATE INDEX "idx_warranty_claims_service_center_org" ON "warranty_claims"("service_center_org_id");
