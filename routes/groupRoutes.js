import express from 'express';
import { db } from '../index.js';
import authenticateToken from '../middlewares/authenticateToken.js';
import { createGroupMessage } from '../groupMessagesUtils.js';
import { sendNotification } from '../notificationsUtils.js';

const router = express.Router();

// Utility function to validate parameters
const validateGroup = (name, description) => {
  const errors = [];
  if (!name || typeof name !== 'string' || name.trim() === '') {
    errors.push('The group name is required and must be a valid string.');
  }
  if (description && typeof description !== 'string') {
    errors.push('The description must be a character string.');
  }
  return errors;
};

// Check if the user is a member of a group
const isUserInGroup = (groupId, userId, callback) => {
  db.get(`SELECT * FROM group_members WHERE groupId = ? AND userId = ?`, [groupId, userId], callback);
};

// Route to create a group
router.post('/', authenticateToken, (req, res) => {
  let { name, description } = req.body;
  const ownerId = req.user.userId;

  if (!description) description = '';

  if (!name) {
    return res.status(422).json({ error: 'The "name" and "description" fields are required.' });
  }

  // Request for user information
  db.get(`SELECT username, profileImage FROM users WHERE id = ?`, [ownerId], (err, user) => {
    if (err || !user) {
      return res.status(500).json({ error: 'Error retrieving user information' });
    }

    const joinCode = Math.random().toString(36).substring(2, 8);

    // Group creation
    db.run(
      `INSERT INTO groups (name, description, ownerId, joinCode) VALUES (?, ?, ?, ?)`,
      [name, description, ownerId, joinCode],
      function (err) {
        if (err) {
          return res.status(400).json({ error: 'Group creation error' });
        }

        const groupId = this.lastID;

        // Add user as group member
        db.run(
          `INSERT INTO group_members (groupId, userId) VALUES (?, ?)`,
          [groupId, ownerId],
          (err) => {
            if (err) {
              return res.status(400).json({ error: 'Error adding user as group member' });
            }

            res.status(201).json({
              id: groupId,
              joinCode,
              name,
              description,
              ownerId: ownerId,
              image: null,
              members: [
                {
                  id: ownerId,
                  username: user.username,
                  profileImage: user.profileImage,
                  lastNotificationDate: null
                }
              ]
            });

            createGroupMessage('createGroup', ownerId, groupId, { groupName: name });
          }
        );
      }
    );
  });
});


// Route to retrieve all groups of the logged-in user
router.get('/', authenticateToken, (req, res) => {
  const userId = req.user.userId;

  // Récupérer tous les groupes auxquels l'utilisateur appartient
  db.all(`SELECT g.id, g.joinCode, g.name, g.description, g.ownerId, g.image
          FROM groups g
          JOIN group_members gm ON g.id = gm.groupId
          WHERE gm.userId = ?`, [userId], (err, groups) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error retrieving groups' });
    }

    if (groups.length === 0) {
      return res.json([]);  // Si l'utilisateur ne fait partie d'aucun groupe
    }

    // Récupérer les membres de chaque groupe
    const groupIds = groups.map(group => group.id);
    db.all(`SELECT gm.groupId, gm.userId AS memberId, gm.lastNotificationDate, u.username AS memberName, u.profileImage
            FROM group_members gm
            JOIN users u ON gm.userId = u.id
            WHERE gm.groupId IN (${groupIds.join(',')})`, (err, members) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error retrieving members' });
      }

      // Organiser les groupes et leurs membres
      const groupsWithMembers = groups.map(group => {
        const groupMembers = members.filter(member => member.groupId === group.id).map(member => ({
          id: member.memberId,
          username: member.memberName,
          profileImage: member.profileImage || null,
          lastNotificationDate: member.lastNotificationDate
        }));

        return {
          id: group.id,
          joinCode: group.joinCode,
          name: group.name,
          description: group.description,
          ownerId: group.ownerId,
          image: group.image || null,
          members: groupMembers
        };
      });

      res.json(groupsWithMembers);
    });
  });
});



// Route to retrieve a specific group
router.get('/:id', authenticateToken, (req, res) => {
  const groupId = req.params.id;
  const userId = req.user.userId;

  isUserInGroup(groupId, userId, (err, member) => {
    if (err) {
      return res.status(500).json({ error: 'Error verifying group membership' });
    }
    if (!member) {
      return res.status(403).json({ error: 'You must be a member of this group to view it' });
    }

    db.get(`SELECT * FROM groups WHERE id = ?`, [groupId], (err, group) => {
      if (err || !group) {
        return res.status(404).json({ error: 'Group not found' });
      }

      db.all(`SELECT gm.userId, u.username, u.profileImage, gm.lastNotificationDate FROM group_members gm
              JOIN users u ON gm.userId = u.id
              WHERE gm.groupId = ?`, [groupId], (err, members) => {
        if (err) {
          return res.status(500).json({ error: 'Error retrieving group members' });
        }

        res.json({
          ...group,
          members: members.map(member => ({
            id: member.userId,
            username: member.username,
            profileImage: member.profileImage,
            lastNotificationDate: member.lastNotificationDate
          })),
        });
      });
    });
  });
});


// Route to update a group
router.put('/:id', authenticateToken, (req, res) => {
  const groupId = req.params.id;
  const { name, description } = req.body;
  const userId = req.user.userId;

  isUserInGroup(groupId, userId, (err, member) => {
    if (err) {
      return res.status(500).json({ error: 'Error verifying group membership' });
    }
    if (!member) {
      return res.status(403).json({ error: 'You must be a member of this group to update it.' });
    }

    const validationErrors = validateGroup(name, description);
    if (validationErrors.length > 0) {
      return res.status(400).json({ errors: validationErrors });
    }

    db.run(
      `UPDATE groups SET name = ?, description = ? WHERE id = ?`,
      [name, description, groupId],
      function (err) {
        if (err) {
          return res.status(400).json({ error: 'Group update error' });
        }

        res.json({ message: 'Group successfully updated' });

        // if the group name has been updated, create a group message
        if (name) {
          createGroupMessage('changeGroupName', userId, groupId, { newName: name });
        }

        // if the group description has been updated, create a group message
        if (description) {
          createGroupMessage('changeGroupDescription', userId, groupId);
        }


        //find all usernames and deviceTokens of the group members
        db.all(`SELECT u.id, u.username, u.deviceToken FROM users u
                JOIN group_members gm ON u.id = gm.userId
                WHERE gm.groupId = ?`, [groupId], (err, members) => {
          if (err) {
            console.error(err);
            return;
          }

          // send a notification to all group members
          const payload = {
            data: {
              title: 'Group updated ✍🏻',
              body: `${member.username} updated the group ${name}`,
            },
            tokens: members
              .filter(member => member.id !== userId && member.deviceToken !== null)
              .map(member => member.deviceToken)
          };

          sendNotification(payload)
            .then(() => {
              console.log('Notification sent successfully');
            })
            .catch(() => {
              console.error('Error sending notification');
            });
        });


      });
  });
});

// Route to delete a group
router.delete('/:id', authenticateToken, (req, res) => {
  const groupId = req.params.id;
  const userId = req.user.userId;

  // Check if the group exists and retrieve the ownerId
  db.get(`SELECT ownerId FROM groups WHERE id = ?`, [groupId], (err, group) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la vérification du groupe' });
    }
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (group.ownerId !== userId) {
      return res.status(403).json({ error: 'You are not authorized to delete this group.' });
    }

    // If the user is the owner, delete the group
    db.run(`DELETE FROM groups WHERE id = ?`, [groupId], function (err) {
      if (err) {
        return res.status(400).json({ error: 'Group deletion error' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Group not found' });
      }
      res.json({ message: 'Group successfully deleted' });
    });
  });
});


// Route to join a group
router.post('/:joinCode/join', authenticateToken, (req, res) => {
  const joinCode = req.params.joinCode;
  const userId = req.user.userId;

  // First check if the group exists
  db.get(`SELECT * FROM groups WHERE joinCode = ?`, [joinCode], (err, group) => {
    if (err || !group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    isUserInGroup(group.id, userId, (err, member) => {
      if (err) {
        return res.status(500).json({ error: 'Error verifying group membership' });
      }

      if (member) {
        return res.status(400).json({ error: 'You are already a member of this group' });
      }

      db.run(
        `INSERT INTO group_members (groupId, userId) VALUES (?, ?)`,
        [group.id, userId],
        function (err) {
          if (err) {
            return res.status(500).json({ error: 'Error when trying to join the group' });
          }

          // Retrieve the updated group details with members
          db.all(
            `SELECT g.*, gm.userId AS memberId, gm.lastNotificationDate AS lastNotificationDate, u.username AS memberName, u.profileImage AS profileImage, u.deviceToken AS deviceToken
             FROM groups g
             JOIN group_members gm ON g.id = gm.groupId
             JOIN users u ON gm.userId = u.id
             WHERE g.id = ?`,
            [group.id],
            (err, rows) => {
              if (err) {
                return res.status(500).json({ error: 'Error retrieving group details' });
              }

              const updatedGroup = {
                id: group.id,
                joinCode: group.joinCode,
                name: group.name,
                description: group.description,
                ownerId: group.ownerId,
                image: group.image || null,
                members: rows.map(row => ({
                  id: row.memberId,
                  username: row.memberName,
                  profileImage: row.profileImage || null,
                  lastNotificationDate: row.lastNotificationDate,
                })),
              };

              res.status(200).json(updatedGroup);

              createGroupMessage('joinGroup', userId, group.id);


              // find the username of the new member
              db.get(`SELECT username FROM users WHERE id = ?`, [userId], (err, user) => {
                if (err) {
                  console.error(err);
                  return;
                }

                // Send a notification to all group members
                const payload = {
                  data: {
                    title: 'New member! 🎉',
                    body: `${user.username} joined the group ${group.name}`,
                  },
                  tokens: rows
                    .filter(row => row.memberId !== userId && row.deviceToken !== null)
                    .map(row => row.deviceToken)
                };

                sendNotification(payload)
                  .then(() => {
                    console.log('Notification sent successfully');
                  })
                  .catch(() => {
                    console.error('Error sending notification');
                  });
              });
            });
        });
    });
  });
});


// Route to leave a group
router.post('/:id/leave', authenticateToken, (req, res) => {
  const groupId = req.params.id;
  const userId = req.user.userId;

  isUserInGroup(groupId, userId, (err, member) => {
    if (err) {
      return res.status(500).json({ error: 'Error verifying group membership' });
    }
    if (!member) {
      return res.status(403).json({ error: 'You are not part of this group' });
    }

    // Check if the user is the group owner
    db.get(`SELECT ownerId FROM groups WHERE id = ?`, [groupId], (err, group) => {
      if (err) {
        return res.status(500).json({ error: 'Error retrieving group information' });
      }
      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }

      const isOwner = group.ownerId === userId;

      // Remove user from group
      db.run(
        `DELETE FROM group_members WHERE groupId = ? AND userId = ?`,
        [groupId, userId],
        function (err) {
          if (err) {
            return res.status(400).json({ error: 'Error trying to leave group' });
          }
          if (this.changes === 0) {
            return res.status(404).json({ error: 'You are not part of this group' });
          }

          // If the user is the owner, check if other members are still present
          if (isOwner) {
            db.get(`SELECT userId FROM group_members WHERE groupId = ? LIMIT 1`, [groupId], (err, newOwner) => {
              if (err) {
                return res.status(500).json({ error: 'Error searching for a new owner' });
              }

              if (newOwner) {
                // Randomly decide of the new owner
                db.run(`UPDATE groups SET ownerId = ? WHERE id = ?`, [newOwner.userId, groupId], (err) => {
                  if (err) {
                    return res.status(500).json({ error: 'Error when assigning a new owner' });
                  }
                  return res.json({ message: 'You have left the group and a new owner has been assigned.' });
                });
              } else {
                // If there are no more members, delete the group
                db.run(`DELETE FROM groups WHERE id = ?`, [groupId], (err) => {
                  if (err) {
                    return res.status(500).json({ error: 'Group deletion error' });
                  }
                  return res.json({ message: 'You left and the group was deleted as there were no more members.' });
                });
              }
            });
          } else {
            // If not the creator, the user simply leaves the group
            res.json({ message: 'You have successfully left the group' });

            createGroupMessage('leaveGroup', userId, groupId);

            // Send a notification to all group members
            db.all(`SELECT u.id, u.username, u.deviceToken FROM users u
                    JOIN group_members gm ON u.id = gm.userId
                    WHERE gm.groupId = ?`, [groupId], (err, members) => {
              if (err) {
                console.error(err);
                return;
              }

              // get the username of the member who left
              db.get(`SELECT username FROM users WHERE id = ?`, [userId], (err, member) => {
                if (err) {
                  console.error(err);
                  return;
                }

                const payload = {
                  data: {
                    title: 'Member left 😢',
                    body: `${member.username} left the group`,
                  },
                  tokens: members
                    .filter(member => member.id !== userId && member.deviceToken !== null)
                    .map(member => member.deviceToken)
                };

                sendNotification(payload)
                  .then(() => {
                    console.log('Notification sent successfully');
                  })
                  .catch(() => {
                    console.error('Error sending notification');
                  });
              });
            });
          }
        }
      );
    });
  });
});


// TODO: test this route
// route to get all groupMessages of a group
router.get('/:groupId/messages', authenticateToken, (req, res) => {
  const groupId = req.params.groupId;
  const userId = req.user.userId;

  isUserInGroup(groupId, userId, (err, member) => {
    if (err) {
      return res.status(500).json({ error: 'Error verifying group membership' });
    }
    if (!member) {
      return res.status(403).json({ error: 'You must be a member of this group to view its messages' });
    }

    db.all(`SELECT gm.id, gm.type, gm.authorId, gm.content, gm.date, u.username AS authorName, u.profileImage AS authorImage
            FROM groupMessages gm
            JOIN users u ON gm.authorId = u.id
            WHERE gm.groupId = ?
            ORDER BY gm.date DESC`, [groupId], (err, messages) => {
      if (err) {
        return res.status(500).json({ error: 'Error retrieving group messages' });
      }

      res.json(messages);
    });
  });
});



// TODO: use the notificationsUtils.js file to send notifications
// // Route to remind a user to pay a debt
router.post('/:groupId/reminder', authenticateToken, (req, res) => {
  // amountOwed is an array of objects { userId, amount }
  const { userWhoOweId, amountOwed } = req.body;
  const groupId = req.params.groupId;

  // check if the authenticated user is a member of the group
  isUserInGroup(groupId, req.user.userId, (err, member) => {
    if (err) {
      return res.status(500).json({ error: 'Error verifying group membership' });
    }
    if (!member) {
      return res.status(403).json({ error: 'You must be a member of this group to send reminders' });
    }

    // check if the user to remind is a member of the group
    isUserInGroup(groupId, userWhoOweId, (err, member) => {
      if (err) {
        return res.status(500).json({ error: 'Error verifying group membership' });
      }
      if (!member) {
        return res.status(404).json({ error: 'User not found in this group' });
      }

      // check if the user to remind has been notified in the last 24 hours
      db.get(`SELECT * FROM group_members WHERE groupId = ? AND userId = ?`, [groupId, userWhoOweId], (err, member) => {
        if (err) {
          return res.status(500).json({ error: 'Error retrieving user information' });
        }
        if (!member) {
          return res.status(404).json({ error: 'User not found in this group' });
        }

        const lastNotificationDate = member.lastNotificationDate;
        const currentDate = new Date().getTime();
        if (lastNotificationDate && currentDate - lastNotificationDate < 86400000) {
          return res.status(400).json({ error: 'You can only send a reminder once every 24 hours' });
        }

        // check the device token of the user to remind
        if (!member.deviceToken) {
          return res.status(422).json({ error: 'The user to remind has not registered a device token' });
        }

        // if the user to remind owes multiple people, send a single notification with the text "You owe {totalAmount} to {maxCreditor} and {otherCreditorsCount} other{s?}!"
        // if the user to remind owes a single person, send a single notification with the text "You owe {totalAmount} to {creditor}!"
        const totalAmount = amountOwed.reduce((acc, amount) => acc + amount.amount, 0); // sum of all amounts owed
        const creditorCount = amountOwed.length; // number of people to whom the user owes money

        // the user to remind owes the largest amount to this person
        const creditor = amountOwed.reduce((max, amount) => (amount.amount > max.amount) ? amount : max, amountOwed[0]);
        const creditorName = creditor.username;

        const message = creditorCount > 1
          ? `You owe ${totalAmount} to ${creditorName} and ${creditorCount - 1} other${creditorCount > 2 ? 's' : ''}!`
          : `You owe ${totalAmount} to ${creditorName}!`;

        const payload = {
          data: {
            title: "Don't forget ⏳",
            body: message
          },
          token: member.deviceToken
        };

        sendNotification(payload)
          .then(() => {
            db.run(`UPDATE group_members SET lastNotificationDate = ? WHERE groupId = ? AND userId = ?`, [currentDate, groupId, userWhoOweId], (err) => {
              if (err) {
                return res.status(500).json({ error: 'Error updating last notification date' });
              }
              res.json({ message: 'Reminder sent successfully' });
            });
          })
          .catch(() => {
            return res.status(500).json({ error: 'Error sending reminder' });
          });
      });
    });
  });
});

// TODO: get route to retrieve all notifications of a group

export default router;
