-- Create a separate sequence for Tax IDs (TIN)
CREATE SEQUENCE revenue.tin_seq START 1000;

-- Update the revenue.records table to use this sequence if needed, 
-- but we will handle it in the application code as it was already doing.
