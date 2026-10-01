CREATE TABLE IF NOT EXISTS orders (
    order_id VARCHAR(50) PRIMARY KEY,
    customer_id VARCHAR(50) NOT NULL,
    order_date TIMESTAMP NOT NULL,
    order_amount DECIMAL(12, 2) NOT NULL,
    status VARCHAR(20) NOT NULL
);

CREATE INDEX idx_orders_customer_id ON orders(customer_id);
