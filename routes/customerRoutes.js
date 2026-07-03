

import express from "express"
import { authenticateToken, requireAdmin, requireSelfOrAdmin } from "../middleware/authMiddleware.js"
import { getAllCustomers, getCustomer, registerCustomer, getCustomerByToken } from "../controllers/customerController.js"
import { createProduct, getProduct, getProducts } from "../controllers/productController.js"
import { checkoutLicense, createLicense, getAllLicenses, getCustomerLicenses, getLicense } from "../controllers/licenseController.js"
import { createPayment, getCustomerPayments } from "../controllers/paymentController.js"
import { getLicenseHistory } from "../controllers/licenseHistoryController.js"
import { getAutomationSettings, updateAutomationSettings } from "../controllers/automationController.js"
import {
  dismissNotification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../controllers/notificationController.js"
const router = express.Router()



/* ----------------------------------
   CUSTOMER ROUTES
-----------------------------------*/
router.get("/customers", authenticateToken, requireAdmin, getAllCustomers)
router.post("/customers/register", registerCustomer)
router.get("/customers/:id", authenticateToken, requireAdmin, getCustomer)
router.get("/customer", authenticateToken, getCustomerByToken)

/* ----------------------------------
   PRODUCT ROUTES
-----------------------------------*/
router.post("/products", authenticateToken, requireAdmin, createProduct)
router.get("/products", authenticateToken, getProducts)
router.get("/products/:id", authenticateToken, getProduct)

/* ----------------------------------
   LICENSE ROUTES
-----------------------------------*/
router.get("/licenses/", authenticateToken, requireAdmin, getAllLicenses)
router.post("/licenses/checkout", authenticateToken, checkoutLicense)
router.post("/licenses", authenticateToken, requireAdmin, createLicense)
router.get("/licenses/:id", authenticateToken, requireAdmin, getLicense)
router.get("/customers/:customerId/licenses", authenticateToken, requireSelfOrAdmin("customerId"), getCustomerLicenses)

/* ----------------------------------
   AUTOMATION ROUTES
-----------------------------------*/
router.get("/automation", authenticateToken, requireAdmin, getAutomationSettings)
router.put("/automation", authenticateToken, requireAdmin, updateAutomationSettings)

/* ----------------------------------
   NOTIFICATION ROUTES
-----------------------------------*/
router.get("/notifications", authenticateToken, getNotifications)
router.patch("/notifications/read-all", authenticateToken, markAllNotificationsRead)
router.patch("/notifications/:id/read", authenticateToken, markNotificationRead)
router.patch("/notifications/:id/dismiss", authenticateToken, dismissNotification)

/* ----------------------------------
   PAYMENT ROUTES
-----------------------------------*/
router.post("/payments", authenticateToken, requireAdmin, createPayment)
router.get("/customers/:customerId/payments", authenticateToken, requireSelfOrAdmin("customerId"), getCustomerPayments)

/* ----------------------------------
   LICENSE HISTORY ROUTES
-----------------------------------*/
router.get("/licenses/:licenseId/history", authenticateToken, requireAdmin, getLicenseHistory)


export default router
