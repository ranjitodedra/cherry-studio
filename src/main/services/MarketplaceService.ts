import { MongoClient, Db, Collection, ObjectId } from 'mongodb'
import { loggerService } from './LoggerService'
import type { MarketplaceServerDoc, MarketplaceServer } from '@shared/types/marketplace'

const logger = loggerService.withContext('MarketplaceService')

class MarketplaceService {
  private client: MongoClient | null = null
  private db: Db | null = null
  private serversCollection: Collection<MarketplaceServerDoc> | null = null
  private isConnected = false

  /**
   * Get MongoDB connection string from environment variables
   */
  private getConnectionString(): string | null {
    // Try different possible env var names (check MARKETPLACE_MONGODB_URI first)
    const connectionString =
      process.env.MARKETPLACE_MONGODB_URI ||
      process.env.MONGODB_URI ||
      process.env.MONGODB_URL ||
      process.env.MONGODB_CONNECTION_STRING ||
      process.env.DATABASE_URL

    if (!connectionString) {
      logger.warn('No MongoDB connection string found in environment variables')
      return null
    }

    return connectionString
  }

  /**
   * Get database name from environment variables
   */
  private getDatabaseName(): string | null {
    return process.env.MARKETPLACE_DB || null
  }

  /**
   * Connect to MongoDB
   */
  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      logger.debug('Already connected to MongoDB')
      return
    }

    const connectionString = this.getConnectionString()
    if (!connectionString) {
      throw new Error('MongoDB connection string not configured. Please set MARKETPLACE_MONGODB_URI or MONGODB_URI in your .env file.')
    }

    try {
      logger.info('Connecting to MongoDB...')
      this.client = new MongoClient(connectionString)
      await this.client.connect()
      
      // Use MARKETPLACE_DB if specified, otherwise use default database from connection string
      const dbName = this.getDatabaseName()
      this.db = dbName ? this.client.db(dbName) : this.client.db()
      
      // Collection name is "servers" as per user's database structure
      this.serversCollection = this.db.collection<MarketplaceServerDoc>('servers')
      this.isConnected = true
      logger.info('Successfully connected to MongoDB', { 
        database: dbName || 'default',
        collection: 'servers'
      })
    } catch (error: any) {
      logger.error('Failed to connect to MongoDB', { error })
      this.isConnected = false
      throw new Error(`MongoDB connection failed: ${error.message}`)
    }
  }

  /**
   * Disconnect from MongoDB
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close()
      this.client = null
      this.db = null
      this.serversCollection = null
      this.isConnected = false
      logger.info('Disconnected from MongoDB')
    }
  }

  /**
   * Ensure connection is established
   */
  private async ensureConnection(): Promise<void> {
    if (!this.isConnected || !this.serversCollection) {
      await this.connect()
    }
  }

  /**
   * Convert MongoDB document to API response format
   */
  private docToServer(doc: MarketplaceServerDoc): MarketplaceServer {
    return {
      id: doc._id?.toString() || '',
      name: doc.name,
      description: doc.description,
      version: doc.version,
      author: doc.author,
      config: doc.config,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      ownerId: doc.ownerId,
      ownerEmail: doc.ownerEmail,
      ownerName: doc.ownerName,
      isPublic: doc.isPublic ?? true,
      videoUrl: doc.videoUrl,
      instructions: doc.instructions,
      category: doc.category,
      website: doc.website,
      supportEmail: doc.supportEmail,
      developerInfo: doc.developerInfo,
      rating: doc.rating,
      installCount: doc.installCount ?? 0,
      repository: doc.repository,
      tags: doc.tags,
      readme: doc.readme
    }
  }

  /**
   * Get all public servers
   */
  async getAllServers(): Promise<MarketplaceServer[]> {
    await this.ensureConnection()
    if (!this.serversCollection) {
      throw new Error('Database not initialized')
    }

    try {
      // First, get total count for debugging
      const totalCount = await this.serversCollection.countDocuments({})
      logger.info(`Total servers in database: ${totalCount}`)
      
      // Query for public servers: isPublic is not false (includes undefined/null, which means public by default)
      // Temporarily fetch ALL servers for debugging if none are found
      let docs = await this.serversCollection
        .find({ isPublic: { $ne: false } })
        .sort({ createdAt: -1 })
        .toArray()
      
      // If no public servers found but we have servers, fetch all for debugging
      if (docs.length === 0 && totalCount > 0) {
        logger.warn('No servers matched isPublic filter, fetching all servers for debugging')
        docs = await this.serversCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray()
      }

      logger.info(`Found ${docs.length} public servers (out of ${totalCount} total)`)
      
      // Log first document structure for debugging
      if (docs.length > 0) {
        logger.debug('Sample server document:', { 
          _id: docs[0]._id?.toString(),
          name: docs[0].name,
          isPublic: docs[0].isPublic,
          hasConfig: !!docs[0].config
        })
      } else if (totalCount > 0) {
        // If we have servers but none match the query, check why
        const sampleDoc = await this.serversCollection.findOne({})
        logger.warn('No public servers found, but database has documents. Sample document:', {
          _id: sampleDoc?._id?.toString(),
          name: sampleDoc?.name,
          isPublic: sampleDoc?.isPublic,
          keys: sampleDoc ? Object.keys(sampleDoc) : []
        })
      }

      return docs.map((doc) => this.docToServer(doc))
    } catch (error: any) {
      logger.error('Error fetching all servers', { error })
      throw new Error(`Failed to fetch servers: ${error.message}`)
    }
  }

  /**
   * Get servers owned by a specific user
   */
  async getMyServers(ownerId: string): Promise<MarketplaceServer[]> {
    await this.ensureConnection()
    if (!this.serversCollection) {
      throw new Error('Database not initialized')
    }

    try {
      const docs = await this.serversCollection
        .find({ ownerId })
        .sort({ createdAt: -1 })
        .toArray()

      return docs.map((doc) => this.docToServer(doc))
    } catch (error: any) {
      logger.error('Error fetching user servers', { error, ownerId })
      throw new Error(`Failed to fetch your servers: ${error.message}`)
    }
  }

  /**
   * Get a single server by ID
   */
  async getServerById(serverId: string): Promise<MarketplaceServer | null> {
    await this.ensureConnection()
    if (!this.serversCollection) {
      throw new Error('Database not initialized')
    }

    try {
      const doc = await this.serversCollection.findOne({ _id: new ObjectId(serverId) })
      if (!doc) {
        return null
      }
      return this.docToServer(doc)
    } catch (error: any) {
      logger.error('Error fetching server by ID', { error, serverId })
      throw new Error(`Failed to fetch server: ${error.message}`)
    }
  }

  /**
   * Create a new server
   */
  async createServer(serverData: Partial<MarketplaceServerDoc>, ownerId: string, ownerEmail?: string, ownerName?: string): Promise<MarketplaceServer> {
    await this.ensureConnection()
    if (!this.serversCollection) {
      throw new Error('Database not initialized')
    }

    try {
      const now = new Date().toISOString()
      const doc: MarketplaceServerDoc = {
        name: serverData.name || '',
        description: serverData.description,
        version: serverData.version,
        author: serverData.author,
        config: serverData.config || {},
        createdAt: now,
        updatedAt: now,
        ownerId,
        ownerEmail,
        ownerName,
        isPublic: serverData.isPublic ?? true,
        videoUrl: serverData.videoUrl,
        instructions: serverData.instructions,
        category: serverData.category,
        website: serverData.website,
        supportEmail: serverData.supportEmail,
        developerInfo: serverData.developerInfo,
        repository: serverData.repository,
        tags: serverData.tags,
        readme: serverData.readme,
        installCount: 0
      }

      const result = await this.serversCollection.insertOne(doc)
      const created = await this.serversCollection.findOne({ _id: result.insertedId })
      if (!created) {
        throw new Error('Failed to retrieve created server')
      }
      return this.docToServer(created)
    } catch (error: any) {
      logger.error('Error creating server', { error })
      throw new Error(`Failed to create server: ${error.message}`)
    }
  }

  /**
   * Update an existing server
   */
  async updateServer(serverId: string, serverData: Partial<MarketplaceServerDoc>, ownerId: string): Promise<MarketplaceServer> {
    await this.ensureConnection()
    if (!this.serversCollection) {
      throw new Error('Database not initialized')
    }

    try {
      // Check ownership
      const existing = await this.serversCollection.findOne({ _id: new ObjectId(serverId) })
      if (!existing) {
        throw new Error('Server not found')
      }
      if (existing.ownerId && existing.ownerId !== ownerId) {
        throw new Error('You do not have permission to update this server')
      }

      const updateDoc: Partial<MarketplaceServerDoc> = {
        ...serverData,
        updatedAt: new Date().toISOString()
      }

      // Remove undefined fields
      Object.keys(updateDoc).forEach((key) => {
        if (updateDoc[key as keyof MarketplaceServerDoc] === undefined) {
          delete updateDoc[key as keyof MarketplaceServerDoc]
        }
      })

      await this.serversCollection.updateOne({ _id: new ObjectId(serverId) }, { $set: updateDoc })
      const updated = await this.serversCollection.findOne({ _id: new ObjectId(serverId) })
      if (!updated) {
        throw new Error('Failed to retrieve updated server')
      }
      return this.docToServer(updated)
    } catch (error: any) {
      logger.error('Error updating server', { error, serverId })
      throw new Error(`Failed to update server: ${error.message}`)
    }
  }

  /**
   * Delete a server
   */
  async deleteServer(serverId: string, ownerId: string): Promise<void> {
    await this.ensureConnection()
    if (!this.serversCollection) {
      throw new Error('Database not initialized')
    }

    try {
      // Check ownership
      const existing = await this.serversCollection.findOne({ _id: new ObjectId(serverId) })
      if (!existing) {
        throw new Error('Server not found')
      }
      if (existing.ownerId && existing.ownerId !== ownerId) {
        throw new Error('You do not have permission to delete this server')
      }

      await this.serversCollection.deleteOne({ _id: new ObjectId(serverId) })
    } catch (error: any) {
      logger.error('Error deleting server', { error, serverId })
      throw new Error(`Failed to delete server: ${error.message}`)
    }
  }

  /**
   * Track server installation
   */
  async trackInstall(serverId: string): Promise<void> {
    await this.ensureConnection()
    if (!this.serversCollection) {
      throw new Error('Database not initialized')
    }

    try {
      await this.serversCollection.updateOne(
        { _id: new ObjectId(serverId) },
        { $inc: { installCount: 1 } }
      )
    } catch (error: any) {
      logger.error('Error tracking installation', { error, serverId })
      // Don't throw - tracking failures shouldn't break the flow
    }
  }

  /**
   * Track server uninstallation
   */
  async trackUninstall(serverId: string): Promise<void> {
    await this.ensureConnection()
    if (!this.serversCollection) {
      throw new Error('Database not initialized')
    }

    try {
      await this.serversCollection.updateOne(
        { _id: new ObjectId(serverId) },
        { $inc: { installCount: -1 } }
      )
    } catch (error: any) {
      logger.error('Error tracking uninstallation', { error, serverId })
      // Don't throw - tracking failures shouldn't break the flow
    }
  }
}

export const marketplaceService = new MarketplaceService()
export default marketplaceService

