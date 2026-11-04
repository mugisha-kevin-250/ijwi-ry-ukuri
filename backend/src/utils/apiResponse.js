function successResponse(res, statusCode = 200, message, data = null) {
  return res.status(statusCode).json({ success: true, message, data });
}

function errorResponse(res, statusCode = 400, message) {
  return res.status(statusCode).json({ success: false, message });
}

module.exports = { successResponse, errorResponse };
