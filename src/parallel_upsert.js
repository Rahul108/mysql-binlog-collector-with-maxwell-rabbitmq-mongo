#!/usr/bin/env node
const mysql = require('mysql2/promise');
const winston = require('winston');
const crypto = require('crypto');

// Configure logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} - ${level}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console()
  ]
});

// MySQL connection configuration
const MYSQL_HOST = process.env.MYSQL_HOST || 'mysql';
const MYSQL_PORT = parseInt(process.env.MYSQL_PORT || '3306');
const MYSQL_USER = process.env.MYSQL_USER || 'root';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || 'rootpassword';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'sample_db';

/**
 * Establish connection to MySQL with retry logic
 */
async function connectToMySQL() {
  while (true) {
    try {
      const connection = await mysql.createConnection({
        host: MYSQL_HOST,
        port: MYSQL_PORT,
        user: MYSQL_USER,
        password: MYSQL_PASSWORD,
        database: MYSQL_DATABASE
      });
      
      logger.info('Successfully connected to MySQL');
      return connection;
    } catch (error) {
      logger.warn(`Failed to connect to MySQL: ${error.message}. Retrying in 5 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

/**
 * Generate a random name for testing
 */
function generateRandomName() {
  const firstNames = ['James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 'William', 'Elizabeth'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Jones', 'Brown', 'Davis', 'Miller', 'Wilson', 'Moore', 'Taylor'];
  
  return `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
}

/**
 * Generate a random email address for testing
 */
function generateRandomEmail(name = null) {
  if (name === null) {
    name = generateRandomName();
  }
  
  // Convert name to lowercase and replace spaces with dots
  const emailName = name.toLowerCase().replace(/\s+/g, '.');
  
  // Add some randomness to ensure uniqueness
  const randomString = crypto.randomBytes(5).toString('hex');
  
  const domains = ['example.com', 'test.com', 'sample.org', 'mail.net'];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  
  return `${emailName}.${randomString}@${domain}`;
}

/**
 * Generate a random status for testing
 */
function generateRandomStatus() {
  const statuses = ['active', 'inactive', 'pending', 'suspended'];
  return statuses[Math.floor(Math.random() * statuses.length)];
}

/**
 * Perform an upsert operation using INSERT ... ON DUPLICATE KEY UPDATE
 */
async function performUpsert(connection, email = null) {
  try {
    const name = generateRandomName();
    if (email === null) {
      email = generateRandomEmail(name);
    }
    const status = generateRandomStatus();
    
    const query = `
      INSERT INTO users (name, email, status) 
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE 
      name = VALUES(name),
      status = VALUES(status)
    `;
    const values = [name, email, status];
    
    const [result] = await connection.execute(query, values);
    
    // Determine if it was an insert or update
    let action, userId;
    
    if (result.insertId === 0) {
      action = 'Updated';
      // Get the ID of the updated user
      const [rows] = await connection.execute('SELECT id FROM users WHERE email = ?', [email]);
      userId = rows[0].id;
    } else {
      action = 'Inserted';
      userId = result.insertId;
    }
    
    logger.info(`${action} user with ID ${userId}: ${name}, ${email}, ${status}`);
    
    return userId;
  } catch (error) {
    logger.error(`Error performing upsert: ${error.message}`);
    return null;
  }
}

/**
 * Run a series of upsert operations in parallel
 */
async function runParallelUpserts(numOperations = 10, concurrency = 5) {
  const connection = await connectToMySQL();
  
  try {
    logger.info(`Starting ${numOperations} upserts with concurrency level: ${concurrency}`);
    
    // Process operations in batches based on concurrency
    for (let i = 0; i < numOperations; i += concurrency) {
      const batchSize = Math.min(concurrency, numOperations - i);
      logger.info(`Running batch ${Math.floor(i/concurrency) + 1} with ${batchSize} parallel upserts`);
      
      // Create an array of upsert promises to execute in parallel
      const upsertPromises = [];
      
      for (let j = 0; j < batchSize; j++) {
        // 50% chance to use an existing email for an update
        if (Math.random() < 0.5) {
          upsertPromises.push((async () => {
            try {
              const [rows] = await connection.execute('SELECT email FROM users ORDER BY RAND() LIMIT 1');
              
              if (rows.length > 0) {
                return await performUpsert(connection, rows[0].email);
              } else {
                return await performUpsert(connection);
              }
            } catch (err) {
              logger.error(`Error in upsert batch: ${err.message}`);
              return null;
            }
          })());
        } else {
          upsertPromises.push(performUpsert(connection));
        }
      }
      
      // Execute all upserts in this batch in parallel
      logger.info(`Executing batch ${Math.floor(i/concurrency) + 1} with ${batchSize} parallel upserts...`);
      const results = await Promise.all(upsertPromises);
      logger.info(`Completed batch ${Math.floor(i/concurrency) + 1} with results: ${results.filter(Boolean).length} successful`);
    }
  } finally {
    if (connection) {
      await connection.end();
      logger.info('MySQL connection closed');
    }
  }
}

/**
 * Main function
 */
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const numOperations = parseInt(args[0]) || 10;
  const concurrency = parseInt(process.env.CONCURRENCY || args[1] || '5');
  
  logger.info(`Starting worker with ${numOperations} operations and ${concurrency} concurrent operations`);
  
  try {
    await runParallelUpserts(numOperations, concurrency);
    logger.info("All operations completed successfully!");
  } catch (error) {
    logger.error(`Error during execution: ${error.message}`);
    process.exit(1);
  }
}

// Start the application
main().catch(error => {
  logger.error(`Failed to start worker: ${error.message}`);
  process.exit(1);
});
