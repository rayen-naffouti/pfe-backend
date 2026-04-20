

import express from "express"
import { authenticateToken } from "../middleware/authMiddleware.js"
import { getAllCustomers, getCustomer, registerCustomer, getCustomerByToken } from "../controllers/customerController.js"
import { createProduct, getProducts } from "../controllers/productController.js"
import { createLicense, getAllLicenses, getCustomerLicenses, getLicense } from "../controllers/licenseController.js"
import { createPayment, getCustomerPayments } from "../controllers/paymentController.js"
import { getLicenseHistory } from "../controllers/licenseHistoryController.js"
const router = express.Router()



/* ----------------------------------
   CUSTOMER ROUTES
-----------------------------------*/
router.get("/customers",authenticateToken ,getAllCustomers)
router.post("/customers/register", registerCustomer)
router.get("/customers/:id", authenticateToken, getCustomer)
router.get("/customer", authenticateToken, getCustomerByToken)

/* ----------------------------------
   PRODUCT ROUTES
-----------------------------------*/
router.post("/products", authenticateToken, createProduct)
router.get("/products", authenticateToken, getProducts)

/* ----------------------------------
   LICENSE ROUTES
-----------------------------------*/
router.get("/licenses/", authenticateToken, getAllLicenses)
router.post("/licenses", authenticateToken, createLicense)
router.get("/licenses/:id", authenticateToken, getLicense)
router.get("/customers/:customerId/licenses", authenticateToken, getCustomerLicenses)

/* ----------------------------------
   PAYMENT ROUTES
-----------------------------------*/
router.post("/payments", authenticateToken, createPayment)
router.get("/customers/:customerId/payments", authenticateToken, getCustomerPayments)

/* ----------------------------------
   LICENSE HISTORY ROUTES
-----------------------------------*/
router.get("/licenses/:licenseId/history", authenticateToken, getLicenseHistory)


export default router

