import { db } from './index.js';


export async function createGroupMessage(type, userId, groupId, data={}) {
    

    if (["joinGroup", "leaveGroup", "changeGroupName",
        "changeGroupImage", "changeGroupDescription",
        "addExpense", "editExpense", "deleteExpense",
        "reminder", "reimbursement", "createGroup"
    ].indexOf(type) === -1) {
        return;
    }

    if (!userId || !groupId) return;
    
    const author = await getAuthor(userId);
    if (!author) return;

    const content = getContent(type, data, author);
    if (!content) return;

    const date = new Date().toISOString();

    // create notification
    const groupMessage = {
        type,
        author,
        content,
        date,
    };

    // save notification in db
    await saveGroupMessage(groupMessage, groupId);
}

function saveGroupMessage(groupMessage, groupId) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO groupMessages (groupId, type, authorId, content, date) VALUES (?, ?, ?, ?, ?)`,
            [groupId, groupMessage.type, groupMessage.author.id, groupMessage.content, groupMessage.date],
            (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            }
        );
    });
}

async function getAuthor(userId) {
    console.log(userId);
    
    return await new Promise((resolve, reject) => {
        db.get(`SELECT id, username FROM users WHERE id = ?`, [userId], (err, row) => {
            
            if (err) {
                console.log(err);
                
                reject(err);
            } else {
                console.log(row);
                if (!row) {
                    reject(null);
                    return;
                }
                resolve({
                    id: row.id,
                    username: row.username,
                });
            }
        });
    });
}

function getContent(type, data, author) {
    try {
        switch (type) {
            case "createGroup":
                return `I just created the group {${data.groupName}}!`
            case "joinGroup":
                return `I just joined the group!`
            case "leaveGroup":
                return `{${author.username}} left the group.`
            case "changeGroupName":
                return `I just changed the group name to {${data.newName}}!`
            case "changeGroupImage":
                return `I just changed the group image.`
            case "changeGroupDescription":
                return `I just changed the group description.`
            case "addExpense":
                return `I just added the expense {${data.expenseName}}.`;
            case "editExpense":
                return `I just edited the expense {${data.expenseName}}.`;
            case "deleteExpense":
                return `I just deleted the expense {${data.expenseName}}.`;
            case "reminder": // TODO
                return `You owe me a total of {${data.amount}}. Don't forget it!`;
            case "reimbursement": // TODO
                return `I just reimbursed {${data.username}} a total of {${data.amount}}.`;
            default:
                return "";
        }
    } catch (error) {
        return "";
    }
}