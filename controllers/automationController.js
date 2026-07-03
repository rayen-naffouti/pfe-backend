import AutomationSettings from "../models/automationSettings.js"

export const getAutomationSettings = async (_req, res) => {
  try {
    const result = await AutomationSettings.get()
    res.json(result)
  } catch (error) {
    console.error("Fetch automation settings error:", error)
    res.status(500).json({
      error: "Server error",
      message: "Failed to fetch automation settings",
    })
  }
}

export const updateAutomationSettings = async (req, res) => {
  try {
    const result = await AutomationSettings.update(req.body)
    res.json({
      message: "Automation rules saved successfully",
      ...result,
    })
  } catch (error) {
    console.error("Update automation settings error:", error)
    res.status(500).json({
      error: "Server error",
      message: "Failed to save automation settings",
    })
  }
}
