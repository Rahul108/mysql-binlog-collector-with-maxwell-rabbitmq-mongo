CREATE DATABASE IF NOT EXISTS sample_db;
USE sample_db;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert some initial data
INSERT INTO users (name, email, status) VALUES
    ('John Doe', 'john.doe@example.com', 'active'),
    ('Jane Smith', 'jane.smith@example.com', 'active'),
    ('Bob Johnson', 'bob.johnson@example.com', 'inactive');

-- Create a user for Maxwell with the necessary permissions
CREATE USER 'maxwell'@'%' IDENTIFIED BY 'maxwell123';
GRANT ALL ON maxwell.* TO 'maxwell'@'%';
GRANT SELECT, REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'maxwell'@'%';
GRANT RELOAD ON *.* TO 'maxwell'@'%';
FLUSH PRIVILEGES;
