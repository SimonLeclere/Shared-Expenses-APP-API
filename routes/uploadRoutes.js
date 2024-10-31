import express from 'express';
import fs from 'fs';
import { db } from '../index.js';
import authenticateToken from '../middlewares/authenticateToken.js';

const router = express.Router();

const deleteFile = (filePath) => {
    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
            if (err) console.error("Error deleting file:", err);
        });
    }
};

// Middleware to check if the user is a member of a group
const checkGroupMembership = (req, res, next) => {
    const userId = req.user.userId;
    const groupId = req.params.groupId;

    db.get(
        `SELECT * FROM group_members WHERE groupId = ? AND userId = ?`,
        [groupId, userId],
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: "Error verifying group membership" });
            }
            if (!row) {
                return res.status(403).json({ error: 'You must be a member of the group to modify this image.' });
            }
            next();
        }
    );
};

const setupUploadRoutes = (upload) => {

    // Route to upload a profile image
    router.post('/profile', authenticateToken, upload.single('image'), (req, res) => {

        if (!req.file) {
            return res.status(400).json({ error: 'No images provided' });
        }

        const userId = req.user.userId;
        const imageUrl = req.file.path;

        db.get(`SELECT profileImage FROM users WHERE id = ?`, [userId], (err, row) => {
            if (err) {
                return res.status(400).json({ error: 'Error retrieving profile image' });
            }

            // Delete the old image if it exists
            if (row && row.profileImage) {
                deleteFile(row.profileImage);
            }

            db.run(`UPDATE users SET profileImage = ? WHERE id = ?`, [imageUrl, userId], (err) => {
                if (err) {
                    return res.status(400).json({ error: 'Error updating profile image' });
                }
                res.json({ message: 'Profile image successfully updated', imageUrl });
            });
        });
    });

    // Route to upload a group image
    router.post('/group/:groupId', authenticateToken, checkGroupMembership, upload.single('image'), (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: 'No images provided' });
        }

        const groupId = req.params.groupId;
        const imageUrl = req.file.path;

        db.get(`SELECT image FROM groups WHERE id = ?`, [groupId], (err, row) => {
            if (err) {
                return res.status(400).json({ error: 'Error retrieving group image' });
            }

            // Delete the old image if it exists
            if (row && row.image) {
                deleteFile(row.image);
            }

            db.run(`UPDATE groups SET image = ? WHERE id = ?`, [imageUrl, groupId], (err) => {
                if (err) {
                    return res.status(400).json({ error: 'Error updating group image' });
                }
                res.json({ message: 'Group image successfully updated', imageUrl });
            });
        });
    });

    // Route to upload an image for an expense
    router.post('/group/:groupId/expense/:expenseId', authenticateToken, checkGroupMembership, upload.single('image'), (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: 'No images provided' });
        }

        const expenseId = req.params.expenseId;
        const imageUrl = req.file.path;

        db.get(`SELECT image FROM expenses WHERE id = ?`, [expenseId], (err, row) => {
            if (err) {
                return res.status(400).json({ error: 'Error retrieving expense image' });
            }

            // Delete the old image if it exists
            if (row && row.image) {
                deleteFile(row.image);
            }

            db.run(`UPDATE expenses SET image = ? WHERE id = ?`, [imageUrl, expenseId], (err) => {
                if (err) {
                    return res.status(400).json({ error: 'Error updating expense image' });
                }
                res.json({ message: 'Expense image successfully updated', imageUrl });
            });
        });
    });

    return router;
};

export default setupUploadRoutes;
