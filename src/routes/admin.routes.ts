import { Router } from 'express';
import {
  activateMaintenance,
  cancelScheduledMaintenance,
  deactivateMaintenance,
  getMaintenanceStatus,
  scheduleMaintenance,
} from '../controllers/admin.controller';
import { verifyAdminKey } from '../middlewares/admin.middleware';

const router = Router();

// Apply admin key verification to all routes
router.use(verifyAdminKey);

// Maintenance management routes
router.get('/maintenance/status', getMaintenanceStatus);
router.post('/maintenance/activate', activateMaintenance);
router.post('/maintenance/deactivate', deactivateMaintenance);
router.post('/maintenance/schedule', scheduleMaintenance);
router.post('/maintenance/cancel', cancelScheduledMaintenance);

export default router;
