import express from 'express';
import { db } from '../index.js';

import authenticateToken from '../middlewares/authenticateToken.js';
import checkUserInGroup from '../middlewares/checkUserInGroup.js';

import { createGroupMessage } from '../groupMessagesUtils.js';

const router = express.Router();

// Route to add an expense to a group
router.post('/:groupId/expenses', authenticateToken, checkUserInGroup, (req, res) => {
    const groupId = req.params.groupId;
    const userId = req.user.userId;
    const { amount, currency, label, type, splitType, date, users, splitValues } = req.body;

    // Add expense to database
    db.run(
        `INSERT INTO expenses (groupId, amount, currency, label, type, payerId, splitType, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [groupId, amount, currency, label, type, userId, splitType, date],
        function (err) {
            if (err) {
                return res.status(400).json({ error: 'Error adding expense' });
            }

            const expenseId = this.lastID;

            // Add distribution values if applicable
            if (splitType === 'shares' || splitType === 'amounts') {
                const insertSplitValues = users.map(user => {
                    return new Promise((resolve, reject) => {
                        db.run(
                            `INSERT INTO expense_split_values (expenseId, userId, splitValue) VALUES (?, ?, ?)`,
                            [expenseId, user, splitValues[user]],
                            (err) => {
                                if (err) {
                                    return reject(err);
                                }
                                resolve();
                            }
                        );
                    });
                });

                // Execute all splitValue insertion promises
                Promise.all(insertSplitValues)
                    .then(() => {
                        // Retrieving user information
                        db.all(
                            `SELECT id, username FROM users WHERE id IN (${users.map(() => '?').join(',')})`,
                            users,
                            (err, userDetails) => {
                                if (err) {
                                    return res.status(500).json({ error: 'Error retrieving user information' });
                                }

                                res.status(201).json({
                                    id: expenseId,
                                    groupId,
                                    amount,
                                    currency,
                                    label,
                                    type,
                                    payerId: userId,
                                    users: userDetails.map(user => ({ id: user.id, username: user.username })),
                                    splitType,
                                    splitValues,
                                    date,
                                    image: null,
                                });

                                createGroupMessage("addExpense", userId, groupId, { expenseName: label });
                            }
                        );
                    })
                    .catch(() => {
                        res.status(400).json({ error: 'Error when adding distribution values' });
                    });
            } else {
                // Retrieving user information
                db.all(
                    `SELECT id, username FROM users WHERE id IN (${users.map(() => '?').join(',')})`,
                    users,
                    (err, userDetails) => {
                        if (err) {
                            return res.status(500).json({ error: 'Error retrieving user information' });
                        }

                        res.status(201).json({
                            id: expenseId,
                            groupId,
                            amount,
                            currency,
                            label,
                            type,
                            payerId: userId,
                            users: userDetails.map(user => ({ id: user.id, username: user.username })),
                            splitType,
                            splitValues: users.reduce((acc, curr) => {
                                acc[curr] = amount / users.length;
                                return acc;
                            }, {}),
                            date,
                            image: null
                        });

                        createGroupMessage("addExpense", userId, groupId, { expenseName: label });
                    })
            }
        })
    }
);


// Route to retrieve a summary of a group's expenses
router.get('/:groupId/expenses', authenticateToken, checkUserInGroup, (req, res) => {
    const groupId = req.params.groupId;

    // If the user is a member, retrieve expenses
    db.all(`SELECT * FROM expenses WHERE groupId = ?`, [groupId], (err, expenses) => {
        if (err) {
            return res.status(500).json({ error: 'Error when retrieving expenses' });
        }

        // For each expense, retrieve allocation values and associated users
        const expensesWithSplitValues = expenses.map(expense => {
            return new Promise((resolve) => {
                // Retrieve distribution values
                db.all(`SELECT userId, splitValue FROM expense_split_values WHERE expenseId = ?`, [expense.id], (err, splitValues) => {
                    if (err) {
                        resolve({ ...expense, splitValues: {}, users: [] });
                    } else {
                        const splitValuesMap = splitValues.reduce((acc, curr) => {
                            acc[curr.userId] = curr.splitValue;
                            return acc;
                        }, {});

                        // Retrieve associated users
                        console.log(splitValues);
                        
                        const userIds = splitValues.map(sv => sv.userId);
                        if (userIds.length === 0) {
                            resolve({ ...expense, splitValues: splitValuesMap, users: [] });
                        } else {
                            db.all(`SELECT id, username FROM users WHERE id IN (${userIds.map(() => '?').join(',')})`, userIds, (err, users) => {
                                if (err) {
                                    console.log("Error retrieving user information");
                                    console.log(err);
                                    
                                    resolve({ ...expense, splitValues: splitValuesMap, users: [] });
                                } else {
                                    resolve({
                                        ...expense,
                                        splitValues: splitValuesMap,
                                        users: users.map(user => ({ id: user.id, username: user.username }))
                                    });
                                }
                            });
                        }
                    }
                });
            });
        });

        // Wait until all promises have been fulfilled
        Promise.all(expensesWithSplitValues)
            .then(expensesWithValues => res.json(expensesWithValues))
            .catch(() => res.status(500).json({ error: 'Error when retrieving expenses' }));
    });
});



// Route to see details of a specific expense
router.get('/:groupId/expenses/:expenseId', authenticateToken, checkUserInGroup, (req, res) => {
    const expenseId = req.params.expenseId;
    const groupId = req.params.groupId;

    // If the user is a member, retrieve the expense
    db.get(`SELECT * FROM expenses WHERE id = ? AND groupId = ?`, [expenseId, groupId], (err, expense) => {
        if (err || !expense) {
            return res.status(404).json({ error: 'Expenses not found' });
        }

        // Retrieve distribution values
        db.all(`SELECT userId, splitValue FROM expense_split_values WHERE expenseId = ?`, [expenseId], (err, splitValues) => {
            if (err) {
                return res.status(500).json({ error: 'Error retrieving distribution values' });
            }

            const splitValuesMap = splitValues.reduce((acc, curr) => {
                acc[curr.userId] = curr.splitValue;
                return acc;
            }, {});

            // Retrieve information on associated users
            const userIds = splitValues.map(sv => sv.userId);
            if (userIds.length === 0) {
                return res.json({
                    ...expense,
                    splitValues: splitValuesMap,
                    users: []
                });
            }

            db.all(
                `SELECT id, username FROM users WHERE id IN (${userIds.map(() => '?').join(',')})`,
                userIds,
                (err, users) => {
                    if (err) {
                        return res.status(500).json({ error: 'Error retrieving user information' });
                    }

                    res.json({
                        ...expense,
                        splitValues: splitValuesMap,
                        users: users.map(user => ({ id: user.id, username: user.username }))
                    });
                }
            );
        });
    });
});


// Route to modify an expense
router.put('/:groupId/expenses/:expenseId', authenticateToken, checkUserInGroup, (req, res) => {
    const expenseId = req.params.expenseId;
    const groupId = req.params.groupId;

    const { amount, currency, label, type, splitType, date, image, users, splitValues } = req.body;

    // Verification of expense existence
    db.get(`SELECT * FROM expenses WHERE id = ? AND groupId = ?`, [expenseId, groupId], (err, expense) => {
        if (err || !expense) {
            return res.status(404).json({ error: 'Expenses not found' });
        }

        // Préparation de la mise à jour
        const updateFields = [];
        const updateValues = [];

        if (amount !== undefined) {
            updateFields.push('amount = ?');
            updateValues.push(amount);
        }
        if (currency !== undefined) {
            updateFields.push('currency = ?');
            updateValues.push(currency);
        }
        if (label !== undefined) {
            updateFields.push('label = ?');
            updateValues.push(label);
        }
        if (type !== undefined) {
            updateFields.push('type = ?');
            updateValues.push(type);
        }
        if (splitType !== undefined) {
            updateFields.push('splitType = ?');
            updateValues.push(splitType);
        }
        if (date !== undefined) {
            updateFields.push('date = ?');
            updateValues.push(date);
        }
        if (image !== undefined) {
            updateFields.push('image = ?');
            updateValues.push(image);
        }

        // Add values for expense ID and group ID
        updateValues.push(expenseId, groupId);

        // If no field to update, return an error
        if (updateFields.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        // Update execution
        db.run(
            `UPDATE expenses SET ${updateFields.join(', ')} WHERE id = ? AND groupId = ?`,
            updateValues,
            function (err) {
                if (err) {
                    return res.status(400).json({ error: 'Error updating expense' });
                }

                // Delete old distribution values
                db.run(`DELETE FROM expense_split_values WHERE expenseId = ?`, [expenseId], (err) => {
                    if (err) {
                        return res.status(400).json({ error: 'Error when deleting distribution values' });
                    }

                    // Add new distribution values
                    if (users && splitValues) {
                        const insertSplitValues = users.map(user => {
                            return new Promise((resolve, reject) => {
                                db.run(
                                    `INSERT INTO expense_split_values (expenseId, userId, splitValue) VALUES (?, ?, ?)`,
                                    [expenseId, user, splitValues[user]],
                                    (err) => {
                                        if (err) {
                                            return reject(err);
                                        }
                                        resolve();
                                    }
                                );
                            });
                        });

                        // Execute all insertion promises
                        Promise.all(insertSplitValues)
                            .then(() => {
                                res.json({ message: 'Expense successfully updated' });

                                createGroupMessage("editExpense", req.user.userId, groupId, { expenseName: label });
                            })
                            .catch(() => {
                                res.status(400).json({ error: 'Error adding new distribution values' });
                            });
                    } else {
                        res.json({ message: 'Expense successfully updated, no modified distribution values' });

                        createGroupMessage("editExpense", req.user.userId, groupId, { expenseName: label });
                    }
                });
            }
        );
    });
});


// Route pour supprimer une dépense
router.delete('/:groupId/expenses/:expenseId', authenticateToken, checkUserInGroup, (req, res) => {
    const expenseId = req.params.expenseId;
    const groupId = req.params.groupId;

    // commencer par récupérer la dépense
    db.get(`SELECT * FROM expenses WHERE id = ? AND groupId = ?`, [expenseId, groupId], (err, expense) => {
        if (err || !expense) {
            return res.status(404).json({ error: 'Expenses not found' });
        }

        // Si l'utilisateur est membre, procédez à la suppression de la dépense
        db.run(`DELETE FROM expenses WHERE id = ? AND groupId = ?`, [expenseId, groupId], function (err) {
            if (err) {
                return res.status(400).json({ error: 'Erreur lors de la suppression de la dépense' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Expenses not found' });
            }

            // Supprimer les valeurs de répartition associées
            db.run(`DELETE FROM expense_split_values WHERE expenseId = ?`, [expenseId], (err) => {
                if (err) {
                    return res.status(400).json({ error: 'Error when deleting distribution values' });
                }
                res.json({ message: 'Expense and its distribution values successfully deleted' });

                createGroupMessage("deleteExpense", req.user.userId, groupId, { expenseName: expense.label });
            });
        });
    });
});

export default router;