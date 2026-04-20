import LicenseHistory from "../models/licenseHistory.js"

export const getLicenseHistory = async (req, res) => {
  try {
    const { licenseId } = req.params

    const history = await LicenseHistory.findByLicense(licenseId)

    res.json(history)
  } catch (error) {
    console.error("Get license history error:", error)
    res.status(500).json({
      error: "Server error",
      message: "Failed to fetch license history",
    })
  }
}
export const createLicenseHistoryEntry = async (req, res) => {
  try {
    const { license_id, action, new_status, note } = req.body

    if (!license_id || !action) {
      return res.status(400).json({
        error: "Validation error",
        message: "License ID and action are required",
      })
    }

    const historyEntry = await LicenseHistory.create({
      license_id,
      action,
      new_status,
      note,
    })

    res.status(201).json({
      message: "License history entry created successfully",
      historyEntry,
    })
  } catch (error) {
    console.error("License history creation error:", error)
    res.status(500).json({
      error: "Server error",
      message: "Failed to create license history entry",
    })
  }
}