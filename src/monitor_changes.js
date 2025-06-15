#!/usr/bin/env node
const { MongoClient } = require('mongodb');
const winston = require('winston');

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

// MongoDB connection configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongodb:27017/';
const MONGODB_DB = process.env.MONGODB_DB || 'binlog_replica';
const MONGODB_COLLECTION = process.env.MONGODB_COLLECTION || 'changes';

/**
 * Connect to MongoDB with retry logic
 */
async function connectToMongoDB() {
  while (true) {
    try {
      const client = new MongoClient(MONGODB_URI);
      await client.connect();
      
      const db = client.db(MONGODB_DB);
      const collection = db.collection(MONGODB_COLLECTION);
      
      logger.info(`Successfully connected to MongoDB at ${MONGODB_URI}`);
      return { client, db, collection };
    } catch (error) {
      logger.warn(`Failed to connect to MongoDB: ${error.message}. Retrying in 5 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

/**
 * Convert Unix timestamp to human-readable format
 */
function formatTimestamp(ts) {
  return new Date(ts).toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Monitor changes in MongoDB collection
 */
async function monitorChanges(interval = 5) {
  const { client, collection } = await connectToMongoDB();
  
  // Keep track of the last time we checked
  let lastCheckTime = Date.now() / 1000; // Unix timestamp in seconds
  
  try {
    while (true) {
      // Query for new changes since last check
      const currentTime = Date.now() / 1000;
      const newChanges = await collection.find({
        received_at: { $gt: lastCheckTime }
      }).sort({ received_at: 1 }).toArray();
      
      let count = 0;
      for (const change of newChanges) {
        count++;
        
        // Extract and format information
        const database = change.database || 'unknown';
        const table = change.table || 'unknown';
        const operation = change.type || 'unknown';
        const timestamp = formatTimestamp((change.ts || 0) / 1000); // Maxwell provides timestamp in milliseconds
        
        // Format the output based on the operation type
        if (operation === 'insert') {
          const data = change.data || {};
          logger.info(`INSERT into ${database}.${table} at ${timestamp}: ${JSON.stringify(data)}`);
        } else if (operation === 'update') {
          const data = change.data || {};
          const old = change.old || {};
          logger.info(`UPDATE in ${database}.${table} at ${timestamp}:`);
          logger.info(`  New data: ${JSON.stringify(data)}`);
          logger.info(`  Old data: ${JSON.stringify(old)}`);
        } else if (operation === 'delete') {
          const data = change.data || {};
          logger.info(`DELETE from ${database}.${table} at ${timestamp}: ${JSON.stringify(data)}`);
        } else {
          logger.info(`Unknown operation ${operation} on ${database}.${table} at ${timestamp}: ${JSON.stringify(change)}`);
        }
      }
      
      // Update the last check time
      if (count > 0) {
        logger.info(`Found ${count} new changes`);
      } else {
        logger.info('No new changes found');
      }
      
      lastCheckTime = currentTime;
      
      // Sleep for the specified interval
      await new Promise(resolve => setTimeout(resolve, interval * 1000));
    }
  } catch (error) {
    logger.error(`Error monitoring changes: ${error.message}`);
  } finally {
    await client.close();
    logger.info('MongoDB connection closed');
  }
}

/**
 * Main function
 */
async function main() {
  try {
    logger.info('Starting MongoDB change monitor...');
    await monitorChanges();
  } catch (error) {
    logger.error(`Failed to start monitor: ${error.message}`);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Monitoring stopped by user');
  process.exit(0);
});

// Start the application
main();
