ALTER TABLE "tickets"
ADD COLUMN "customer_service_rating" INTEGER;

ALTER TABLE "tickets"
ADD CONSTRAINT "tickets_customer_service_rating_check"
CHECK (
  "customer_service_rating" IS NULL
  OR (
    "customer_service_rating" >= 1
    AND "customer_service_rating" <= 5
  )
);
