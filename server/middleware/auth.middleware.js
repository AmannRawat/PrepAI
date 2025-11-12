const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    // Get the token from the request header
    const authHeader = req.header('Authorization');
    
    // Check if the token exists
    if (!authHeader) {
        return res.status(401).json({ message: 'No token, authorization denied.' });
    }

    try {
        //Check if the token format is correct
        const token = authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: 'Token format is invalid.' });
        }

        // Verify the token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Add the user's info to the request object
        // Now, all protected routes will know who the user is.
        req.user = decoded.user;
        
        // Tell Express to move on to the next function (the main API logic)
        next();

    } catch (error) {
        console.error('Token verification error:', error.message);
        res.status(401).json({ message: 'Token is not valid.' });
    }
};

module.exports = authMiddleware;