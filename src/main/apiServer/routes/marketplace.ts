import express, { Request, Response } from 'express'
import { loggerService } from '../../services/LoggerService'
import { marketplaceService } from '../../services/MarketplaceService'

const logger = loggerService.withContext('ApiServerMarketplaceRoutes')

const router = express.Router()

/**
 * Extract user information from request headers
 */
function getUserFromRequest(req: Request): { id: string; email?: string; name?: string } | null {
  const userId = req.headers['x-user-id'] as string
  const userEmail = req.headers['x-user-email'] as string | undefined
  const userName = req.headers['x-user-name'] as string | undefined

  if (!userId) {
    return null
  }

  return {
    id: userId,
    email: userEmail,
    name: userName
  }
}

/**
 * @swagger
 * /api/marketplace/servers:
 *   get:
 *     summary: Get all public marketplace servers
 *     description: Retrieve a list of all publicly available MCP servers
 *     tags: [Marketplace]
 *     responses:
 *       200:
 *         description: List of marketplace servers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MarketplaceServer'
 */
router.get('/servers', async (req: Request, res: Response) => {
  try {
    logger.debug('Fetching all marketplace servers')
    const servers = await marketplaceService.getAllServers()
    logger.info(`Returning ${servers.length} servers to client`)
    return res.json({
      success: true,
      data: servers
    })
  } catch (error: any) {
    logger.error('Error fetching marketplace servers', { error })
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch servers'
    })
  }
})

/**
 * @swagger
 * /api/marketplace/servers/my:
 *   get:
 *     summary: Get user's own servers
 *     description: Retrieve servers created by the authenticated user
 *     tags: [Marketplace]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of user's servers
 *       401:
 *         description: Unauthorized
 */
router.get('/servers/my', async (req: Request, res: Response) => {
  try {
    const user = getUserFromRequest(req)
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      })
    }

    logger.debug('Fetching user servers', { userId: user.id })
    const servers = await marketplaceService.getMyServers(user.id)
    return res.json({
      success: true,
      data: servers
    })
  } catch (error: any) {
    logger.error('Error fetching user servers', { error })
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch your servers'
    })
  }
})

/**
 * @swagger
 * /api/marketplace/servers/{serverId}:
 *   get:
 *     summary: Get a specific server
 *     description: Retrieve detailed information about a marketplace server
 *     tags: [Marketplace]
 *     parameters:
 *       - in: path
 *         name: serverId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Server information
 *       404:
 *         description: Server not found
 */
router.get('/servers/:serverId', async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params
    logger.debug('Fetching server', { serverId })
    const server = await marketplaceService.getServerById(serverId)
    
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found'
      })
    }

    return res.json({
      success: true,
      data: server
    })
  } catch (error: any) {
    logger.error('Error fetching server', { error })
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch server'
    })
  }
})

/**
 * @swagger
 * /api/marketplace/servers:
 *   post:
 *     summary: Create a new marketplace server
 *     description: Create a new MCP server entry in the marketplace
 *     tags: [Marketplace]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateMarketplaceServerRequest'
 *     responses:
 *       201:
 *         description: Server created successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/servers', async (req: Request, res: Response) => {
  try {
    const user = getUserFromRequest(req)
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      })
    }

    logger.debug('Creating server', { userId: user.id })
    const server = await marketplaceService.createServer(
      req.body,
      user.id,
      user.email,
      user.name
    )

    return res.status(201).json({
      success: true,
      data: server
    })
  } catch (error: any) {
    logger.error('Error creating server', { error })
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to create server'
    })
  }
})

/**
 * @swagger
 * /api/marketplace/servers/{serverId}:
 *   put:
 *     summary: Update a marketplace server
 *     description: Update an existing marketplace server (only by owner)
 *     tags: [Marketplace]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: serverId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateMarketplaceServerRequest'
 *     responses:
 *       200:
 *         description: Server updated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not the owner)
 */
router.put('/servers/:serverId', async (req: Request, res: Response) => {
  try {
    const user = getUserFromRequest(req)
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      })
    }

    const { serverId } = req.params
    logger.debug('Updating server', { serverId, userId: user.id })
    
    const server = await marketplaceService.updateServer(serverId, req.body, user.id)

    return res.json({
      success: true,
      data: server
    })
  } catch (error: any) {
    logger.error('Error updating server', { error })
    const statusCode = error.message.includes('permission') ? 403 : 
                      error.message.includes('not found') ? 404 : 500
    return res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to update server'
    })
  }
})

/**
 * @swagger
 * /api/marketplace/servers/{serverId}:
 *   delete:
 *     summary: Delete a marketplace server
 *     description: Delete a marketplace server (only by owner)
 *     tags: [Marketplace]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: serverId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Server deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not the owner)
 */
router.delete('/servers/:serverId', async (req: Request, res: Response) => {
  try {
    const user = getUserFromRequest(req)
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      })
    }

    const { serverId } = req.params
    logger.debug('Deleting server', { serverId, userId: user.id })
    
    await marketplaceService.deleteServer(serverId, user.id)

    return res.json({
      success: true
    })
  } catch (error: any) {
    logger.error('Error deleting server', { error })
    const statusCode = error.message.includes('permission') ? 403 : 
                      error.message.includes('not found') ? 404 : 500
    return res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to delete server'
    })
  }
})

/**
 * @swagger
 * /api/marketplace/servers/{serverId}/install:
 *   post:
 *     summary: Track server installation
 *     description: Increment the installation count for a server
 *     tags: [Marketplace]
 *     parameters:
 *       - in: path
 *         name: serverId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Installation tracked
 */
router.post('/servers/:serverId/install', async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params
    logger.debug('Tracking installation', { serverId })
    await marketplaceService.trackInstall(serverId)
    return res.json({
      success: true
    })
  } catch (error: any) {
    logger.error('Error tracking installation', { error })
    // Don't fail the request if tracking fails
    return res.json({
      success: true
    })
  }
})

/**
 * @swagger
 * /api/marketplace/servers/{serverId}/uninstall:
 *   post:
 *     summary: Track server uninstallation
 *     description: Decrement the installation count for a server
 *     tags: [Marketplace]
 *     parameters:
 *       - in: path
 *         name: serverId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Uninstallation tracked
 */
router.post('/servers/:serverId/uninstall', async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params
    logger.debug('Tracking uninstallation', { serverId })
    await marketplaceService.trackUninstall(serverId)
    return res.json({
      success: true
    })
  } catch (error: any) {
    logger.error('Error tracking uninstallation', { error })
    // Don't fail the request if tracking fails
    return res.json({
      success: true
    })
  }
})

export { router as marketplaceRoutes }

