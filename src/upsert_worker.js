#!/usr/bin/env node
const mysql = require('mysql2/promise');
const winston = require('winston');
const argparse = require('argparse');
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
 * Perform an insert operation
 */
async function performInsert(connection) {
  try {
    const name = generateRandomName();
    const email = generateRandomEmail(name);
    const status = generateRandomStatus();
    
    const query = 'INSERT INTO users (name, email, status) VALUES (?, ?, ?)';
    const values = [name, email, status];
    
    const [result] = await connection.execute(query, values);
    
    const userId = result.insertId;
    logger.info(`Inserted new user with ID ${userId}: ${name}, ${email}, ${status}`);
    
    return userId;
  } catch (error) {
    logger.error(`Error performing insert: ${error.message}`);
    return null;
  }
}

/**
 * Perform an update operation
 */
async function performUpdate(connection, userId = null) {
  try {
    // If no userId is provided, select a random user
    if (userId === null) {
      const [rows] = await connection.execute('SELECT id FROM users ORDER BY RAND() LIMIT 1');
      
      if (rows.length > 0) {
        userId = rows[0].id;
      } else {
        logger.warn('No users found to update');
        return null;
      }
    }
    
    // Generate new values
    const name = generateRandomName();
    const status = generateRandomStatus();
    
    const query = 'UPDATE users SET name = ?, status = ? WHERE id = ?';
    const values = [name, status, userId];
    
    const [result] = await connection.execute(query, values);
    
    if (result.affectedRows > 0) {
      logger.info(`Updated user with ID ${userId}: new name = ${name}, new status = ${status}`);
      return userId;
    } else {
      logger.warn(`User with ID ${userId} not found`);
      return null;
    }
  } catch (error) {
    logger.error(`Error performing update: ${error.message}`);
    return null;
  }
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
 * Delete a user from the database
 */
async function deleteUser(connection, userId = null) {
  try {
    // If no userId is provided, select a random user
    if (userId === null) {
      const [rows] = await connection.execute('SELECT id FROM users ORDER BY RAND() LIMIT 1');
      
      if (rows.length > 0) {
        userId = rows[0].id;
      } else {
        logger.warn('No users found to delete');
        return null;
      }
    }
    
    const query = 'DELETE FROM users WHERE id = ?';
    
    const [result] = await connection.execute(query, [userId]);
    
    if (result.affectedRows > 0) {
      logger.info(`Deleted user with ID ${userId}`);
      return userId;
    } else {
      logger.warn(`User with ID ${userId} not found`);
      return null;
    }
  } catch (error) {
    logger.error(`Error performing delete: ${error.message}`);
    return null;
  }
}

/**
 * Run a series of database operations with parallel execution
 */
async function runOperations(numOperations = 10, interval = 2.0, concurrency = 5) {
  const connection = await connectToMySQL();
  
  try {
    logger.info(`Starting operations with concurrency level: ${concurrency}`);
    
    // Process operations in batches based on concurrency
    for (let i = 0; i < numOperations; i += concurrency) {
      const batchSize = Math.min(concurrency, numOperations - i);
      logger.info(`Running batch ${Math.floor(i/concurrency) + 1} with ${batchSize} operations in parallel`);
      
      // Create an array of operation promises to execute in parallel
      const operationPromises = [];
      
      for (let j = 0; j < batchSize; j++) {
        operationPromises.push((async () => {
          const operations = ['insert', 'update', 'upsert', 'delete'];
          const operation = operations[Math.floor(Math.random() * operations.length)];
          
          if (operation === 'insert') {
            return await performInsert(connection);
          } else if (operation === 'update') {
            return await performUpdate(connection);
          } else if (operation === 'upsert') {
            // 50% chance to use an existing email for an update
            if (Math.random() < 0.5) {
              const [rows] = await connection.execute('SELECT email FROM users ORDER BY RAND() LIMIT 1');
              
              if (rows.length > 0) {
                return await performUpsert(connection, rows[0].email);
              } else {
                return await performUpsert(connection);
              }
            } else {
              return await performUpsert(connection);
            }
          } else if (operation === 'delete') {
            return await deleteUser(connection);
          }
        })());
      }
      
      // Execute all operations in this batch in parallel
      logger.info(`Executing batch ${Math.floor(i/concurrency) + 1} with ${batchSize} parallel operations...`);
      await Promise.all(operationPromises);
      logger.info(`Completed batch ${Math.floor(i/concurrency) + 1}`);
      
      // Sleep between batches
      if (i + batchSize < numOperations) {
        logger.info(`Batch ${Math.floor(i/concurrency) + 1} completed. Waiting ${interval} seconds before next batch...`);
        await new Promise(resolve => setTimeout(resolve, interval * 1000));
      }
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
  // Set up command line arguments
  const parser = new argparse.ArgumentParser({
    description: 'Run MySQL operations for testing'
  });
  
  parser.add_argument('--operations', {
    dest: 'operations',
    type: 'int',
    default: 10,
    help: 'Number of operations to perform'
  });
  
  parser.add_argument('--interval', {
    dest: 'interval',
    type: 'float',
    default: 2.0,
    help: 'Interval between operations in seconds'
  });
  
  const args = parser.parse_args();
  
  // Handle concurrency through environment variable or default to 5
  const concurrency = parseInt(process.env.CONCURRENCY || '5');
  
  logger.info(`Starting worker with ${args.operations} operations, ${args.interval}s interval, and ${concurrency} concurrent operations`);
  await runOperations(args.operations, args.interval, concurrency);
}

// Start the application
main().catch(error => {
  logger.error(`Failed to start worker: ${error.message}`);
  process.exit(1);
});
