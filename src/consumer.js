// consumer.js
const amqp = require('amqplib');
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

// Constants and configuration
const RABBITMQ_HOST = process.env.RABBITMQ_HOST || 'rabbitmq';
const RABBITMQ_PORT = parseInt(process.env.RABBITMQ_PORT || '5672');
const RABBITMQ_USER = process.env.RABBITMQ_USER || 'guest';
const RABBITMQ_PASS = process.env.RABBITMQ_PASS || 'guest';
const RABBITMQ_EXCHANGE = process.env.RABBITMQ_EXCHANGE || 'maxwell';
const RABBITMQ_QUEUE = process.env.RABBITMQ_QUEUE || 'maxwell_consumer';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongodb:27017/';
const MONGODB_DB = process.env.MONGODB_DB || 'binlog_replica';
const MONGODB_COLLECTION = process.env.MONGODB_COLLECTION || 'changes';

/**
 * Connect to RabbitMQ with retry logic
 */
async function connectToRabbitMQ() {
  while (true) {
    try {
      // Create connection
      const connectionString = `amqp://${RABBITMQ_USER}:${RABBITMQ_PASS}@${RABBITMQ_HOST}:${RABBITMQ_PORT}`;
      const connection = await amqp.connect(connectionString);
      
      // Handle connection errors and close events
      connection.on('error', (err) => {
        logger.error(`RabbitMQ connection error: ${err.message}`);
        setTimeout(connectToRabbitMQ, 5000);
      });
      
      connection.on('close', () => {
        logger.warn('RabbitMQ connection closed. Reconnecting...');
        setTimeout(connectToRabbitMQ, 5000);
      });
      
      // Create channel
      const channel = await connection.createChannel();
      
      // Declare exchange
      await channel.assertExchange(RABBITMQ_EXCHANGE, 'fanout', { durable: true });
      
      // Declare queue
      await channel.assertQueue(RABBITMQ_QUEUE, { durable: true });
      
      // Bind queue to exchange
      await channel.bindQueue(RABBITMQ_QUEUE, RABBITMQ_EXCHANGE, '');
      
      logger.info('Successfully connected to RabbitMQ');
      return { connection, channel };
    } catch (error) {
      logger.warn(`Failed to connect to RabbitMQ: ${error.message}. Retrying in 5 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

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
      
      // Create indexes for faster querying
      await collection.createIndex({ database: 1, table: 1 });
      await collection.createIndex({ 'data.id': 1 });
      await collection.createIndex({ ts: 1 });
      
      logger.info('Successfully connected to MongoDB');
      return { client, collection };
    } catch (error) {
      logger.warn(`Failed to connect to MongoDB: ${error.message}. Retrying in 5 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

/**
 * Process incoming message from RabbitMQ
 */
async function processMessage(message, channel, collection) {
  try {
    // Parse the JSON message
    const content = JSON.parse(message.content.toString());
    
    // Add a timestamp for when we received the message
    content.received_at = Date.now() / 1000; // Unix timestamp in seconds
    
    // Store the message in MongoDB
    await collection.insertOne(content);
    
    // Log information about the message
    const database = content.database || 'unknown';
    const table = content.table || 'unknown';
    const typeOfChange = content.type || 'unknown';
    
    logger.info(`Processed ${typeOfChange} event for ${database}.${table}`);
    
    // Acknowledge the message
    channel.ack(message);
  } catch (error) {
    logger.error(`Error processing message: ${error.message}`);
    // Reject the message and requeue it
    channel.nack(message, false, true);
  }
}

/**
 * Main function
 */
async function main() {
  let mongoClient, rabbitMQConnection;
  
  try {
    // Connect to MongoDB
    const mongodb = await connectToMongoDB();
    mongoClient = mongodb.client;
    const collection = mongodb.collection;
    
    // Connect to RabbitMQ
    const rabbitmq = await connectToRabbitMQ();
    rabbitMQConnection = rabbitmq.connection;
    const channel = rabbitmq.channel;
    
    // Set up consumer with prefetch
    channel.prefetch(1);
    
    logger.info('Starting to consume messages...');
    
    // Start consuming messages
    channel.consume(RABBITMQ_QUEUE, (message) => {
      if (message) {
        processMessage(message, channel, collection).catch(err => {
          logger.error(`Error in message processing: ${err.message}`);
        });
      }
    });
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down consumer...');
      
      try {
        // Close RabbitMQ connection
        if (rabbitMQConnection) {
          await rabbitMQConnection.close();
        }
        
        // Close MongoDB connection
        if (mongoClient) {
          await mongoClient.close();
        }
        
        logger.info('Consumer has been shut down');
        process.exit(0);
      } catch (error) {
        logger.error(`Error during shutdown: ${error.message}`);
        process.exit(1);
      }
    });
  } catch (error) {
    logger.error(`Unexpected error in main: ${error.message}`);
    
    // Clean up resources
    if (rabbitMQConnection) {
      await rabbitMQConnection.close();
    }
    
    if (mongoClient) {
      await mongoClient.close();
    }
    
    process.exit(1);
  }
}

// Start the application
main().catch(error => {
  logger.error(`Failed to start consumer: ${error.message}`);
  process.exit(1);
});
