import Notification from "../models/notification.js"

const parseBoolean = (value, fallback = false) => {
  if (typeof value !== "string") {
    return fallback
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase())
}

const getNotificationOptions = (req) => ({
  userId: req.userId,
  role: req.query.scope === "mine" ? "user" : req.userRole,
  limit: req.query.limit,
  includeDismissed: req.userRole === "admin" && req.query.scope !== "mine" && parseBoolean(req.query.include_dismissed),
  includeScheduled: req.userRole === "admin" && req.query.scope !== "mine" && parseBoolean(req.query.include_scheduled),
})

export const getNotifications = async (req, res) => {
  try {
    const options = getNotificationOptions(req)
    const notifications = await Notification.findForAccount(options)
    const unreadCount = await Notification.countUnreadForAccount({ userId: req.userId, role: options.role })

    res.json({
      notifications,
      unread_count: unreadCount,
    })
  } catch (error) {
    console.error("Get notifications error:", error)
    res.status(500).json({
      error: "Server error",
      message: "Failed to fetch notifications",
    })
  }
}

export const markNotificationRead = async (req, res) => {
  try {
    const notification = await Notification.markRead({
      id: req.params.id,
      userId: req.userId,
      role: req.userRole,
    })

    if (!notification) {
      return res.status(404).json({
        error: "Not found",
        message: "Notification not found",
      })
    }

    res.json({
      message: "Notification marked as read",
      notification,
    })
  } catch (error) {
    console.error("Mark notification read error:", error)
    res.status(500).json({
      error: "Server error",
      message: "Failed to mark notification as read",
    })
  }
}

export const markAllNotificationsRead = async (req, res) => {
  try {
    const updated = await Notification.markAllRead({
      userId: req.userId,
      role: req.userRole,
    })

    res.json({
      message: "Notifications marked as read",
      updated_count: updated.length,
    })
  } catch (error) {
    console.error("Mark all notifications read error:", error)
    res.status(500).json({
      error: "Server error",
      message: "Failed to mark notifications as read",
    })
  }
}

export const dismissNotification = async (req, res) => {
  try {
    const notification = await Notification.dismiss({
      id: req.params.id,
      userId: req.userId,
      role: req.userRole,
    })

    if (!notification) {
      return res.status(404).json({
        error: "Not found",
        message: "Notification not found",
      })
    }

    res.json({
      message: "Notification dismissed",
      notification,
    })
  } catch (error) {
    console.error("Dismiss notification error:", error)
    res.status(500).json({
      error: "Server error",
      message: "Failed to dismiss notification",
    })
  }
}
