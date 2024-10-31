import { db } from "../index.js";

// Middleware to check if the user is a member of a group
const checkUserInGroup = (req, res, next) => {
    const groupId = req.params.groupId;
    const userId = req.user.userId;
    

    db.get(`SELECT * FROM group_members WHERE groupId = ? AND userId = ?`, [groupId, userId], (err, member) => {
                
        if (err) {
            return res.status(500).json({ error: 'Error verifying group membership' });
        }
        if (!member) {
            return res.status(403).json({ error: 'You must be a member of this group to access this resource' });
        }
        next();
    });
};

export default checkUserInGroup;