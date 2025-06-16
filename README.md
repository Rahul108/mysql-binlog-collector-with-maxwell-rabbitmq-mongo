# MySQL Binlog to MongoDB Replication with Maxwell and RabbitMQ

This project provides a solution for monitoring MySQL binary log (binlog) changes using Maxwell, sending them through RabbitMQ, and storing them in MongoDB. It's designed to capture database changes (inserts, updates, deletes) from MySQL and store them in MongoDB for analysis, reporting, or as part of a data pipeline.

## Architecture

1. **MySQL Database**: Source database where operations are performed
2. **Maxwell**: Reads MySQL binlog events and sends them to RabbitMQ
3. **RabbitMQ**: Message broker for event distribution
4. **Consumer (Node.js)**: Reads messages from RabbitMQ and stores them in MongoDB
5. **MongoDB**: Target database where changes are stored
6. **Upsert Worker (Node.js)**: Script to perform test upsert operations in MySQL
7. **Monitor (Node.js)**: Displays changes as they arrive in MongoDB

## Prerequisites

- Docker and Docker Compose
- Git (for cloning the repository)

## Getting Started

### 1. Start the services

```bash
docker compose up -d
```

This will start all services:
- MySQL database
- MongoDB
- RabbitMQ
- Maxwell (binlog monitor)
- Consumer (RabbitMQ to MongoDB)
- Monitor (displays changes)
- Upsert worker (for testing)

### 2. Run sample upsert operations

You can run the upsert worker manually to perform test operations:

```bash
docker compose exec upsert-worker node /app/upsert_worker.js --operations 10 --interval 2
```

for running parallel_upsert script
```bash
docker compose exec -e CONCURRENCY=20 upsert-worker node /app/parallel_upsert.js 100000
```

This will perform 10 random operations (insert, update, upsert, delete) with a 2-second interval between operations.

### 3. Watch changes in real-time

The monitor service will automatically display changes as they are stored in MongoDB. You can view its logs with:

```bash
docker compose logs -f monitor
```

### 4. Check MongoDB for replicated changes

You can also directly query MongoDB to see all the changes:

```bash
docker compose exec mongodb mongosh
```

Then in the MongoDB shell:
```javascript
use binlog_replica
db.changes.find().sort({ts: -1}).limit(10)  // Shows the 10 most recent changes
```

## Sample Database

The project includes a sample database with a `users` table that has the following schema:

```sql
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

## Configuration

The project can be configured through environment variables in the docker-compose.yml file.

### MySQL Configuration
- `MYSQL_ROOT_PASSWORD`: Root password for MySQL
- `MYSQL_DATABASE`: Default database name
- `MYSQL_USER`: Regular user username
- `MYSQL_PASSWORD`: Regular user password

### RabbitMQ Configuration
- `RABBITMQ_DEFAULT_USER`: RabbitMQ username
- `RABBITMQ_DEFAULT_PASS`: RabbitMQ password

### MongoDB Configuration
- `MONGODB_URI`: MongoDB connection URI
- `MONGODB_DB`: MongoDB database name
- `MONGODB_COLLECTION`: MongoDB collection name

## Customization

### Adding More Tables

To monitor more tables, simply create them in the MySQL database. Maxwell will automatically capture changes from all tables.

### Modifying Data Processing

If you need to customize how data is processed before being stored in MongoDB, you can modify the `consumer.js` script.

## Troubleshooting

- **Maxwell not connecting to MySQL**: Check the Maxwell logs for connection errors. Ensure the MySQL user has the necessary permissions.
- **Consumer not receiving messages**: Check RabbitMQ management interface (http://localhost:15672) to verify messages are being published.
- **Changes not appearing in MongoDB**: Check the consumer logs for any errors in processing or storing messages.

## Project Structure

```
.
├── docker/
│   ├── maxwell/
│   │   └── config.properties    # Maxwell configuration
│   └── mysql/
│       ├── init.sql             # MySQL initialization script
│       └── my.cnf               # MySQL configuration
├── src/
│   ├── consumer.js              # RabbitMQ to MongoDB consumer (Node.js)
│   ├── monitor_changes.js       # MongoDB change monitor (Node.js)
│   └── upsert_worker.js         # Worker for test operations (Node.js)
├── Dockerfile                   # Docker image for Node.js services
├── docker-compose.yml           # Docker Compose configuration
├── README.md                    # Project documentation
└── package.json                 # Node.js dependencies
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
