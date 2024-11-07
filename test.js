// import { app } from './index.js';
import jwt from 'jsonwebtoken';

// URL de base pour l'API
const baseUrl = 'http://localhost:3000';

// Fonction pour créer un compte
async function registerUser(username, verbose) {
    const response = await fetch(`${baseUrl}/users/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: username,
            email: `${username}@example.com`,
            password: 'testpassword'
        })
    });
    const data = await response.json();
    if (response.ok) {
        if (verbose) console.log('Utilisateur créé:', data);
        return data; // Retourne les détails du compte créé
    } else {
        console.error('Erreur lors de la création du compte:', data);
    }
}

// Fonction pour se connecter
async function loginUser(username, verbose) {
    const response = await fetch(`${baseUrl}/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: `${username}@example.com`,
            password: 'testpassword'
        })
    });
    const data = await response.json();
    if (response.ok) {
        if (verbose) console.log('Utilisateur connecté:', data);
        return data.token; // Retourne le token JWT
    } else {
        console.error('Erreur lors de la connexion:', data);
        return null;
    }
}

async function getProfile(token) {
    const response = await fetch(`${baseUrl}/users/profile`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    });
    const data = await response.json();
    if (response.ok) {
        console.log('Profil utilisateur:', data);
    } else {
        console.error('Erreur lors de la récupération du profil:', data);
    }
}

// Fonction pour créer un groupe
async function createGroup(token, verbose) {
    const response = await fetch(`${baseUrl}/groups`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            name: 'Groupe Test',
            description: 'Un groupe créé pour le test'
        })
    });    

    const data = await response.json();

    if (response.ok) {
        if (verbose) console.log('Groupe créé:', data);
        return data; // Retourne les détails du groupe
    } else {
        console.error('Group creation error:', data);
        return null;
    }
}

async function getGroups(token) {
    const response = await fetch(`${baseUrl}/groups`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    });
    const data = await response.json();

    if (response.ok) {
        console.log('Groupes de l\'utilisateur:', JSON.stringify(data, null, 2));
    }
    else {
        console.error('Erreur lors de la récupération des groupes:', data);
    }
}

async function getSpecificGroup(token, groupId) {
    const response = await fetch(`${baseUrl}/groups/${groupId}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    });
    const data = await response.json();

    if (response.ok) {
        console.log('Détails du groupe:', JSON.stringify(data, null, 2));
    }
    else {
        console.error('Erreur lors de la récupération du groupe:', data);
    }
}

// - **POST** `/groups/{groupId}/expenses` : Ajouter une dépense à un groupe
// - **GET** `/groups/{groupId}/expenses` : Récupérer le résumé des dépenses d'un groupe
// - **GET** `/groups/{groupId}/expenses/{expenseId}` : Voir le détail d'une dépense spécifique

async function addExpense(token, groupId, usersIds) {
    // amount, currency, label, type, splitType, date, image, users, splitValues

    const response = await fetch(`${baseUrl}/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            amount: 100,
            currency: 'EUR',
            label: 'Déjeuner',
            type: 'expense',
            splitType: 'shares',
            date: new Date().toISOString(),
            users: usersIds,
            splitValues: Object.fromEntries(usersIds.map(id => [id, 1 / usersIds.length]))
        })
    });
    const data = await response.json();

    if (response.ok) {
        console.log('Dépense ajoutée:', data);
    }
    else {
        console.error('Error adding expense:', data);
    }
}

async function batchJoinGroup(usersTokens, groupId) {

    for (const token of usersTokens) {
        const response = await fetch(`${baseUrl}/groups/${groupId}/join`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await response.json();

        if (response.ok) {
            console.log('Utilisateur ajouté au groupe:', data);
        }
        else {
            console.error('Erreur lors de l\'ajout de l\'utilisateur au groupe:', data);
        }
    }
}
    
async function getAllExpenses(token, groupId) {
    const response = await fetch(`${baseUrl}/groups/${groupId}/expenses`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    });
    const data = await response.json();

    if (response.ok) {
        console.log('Dépenses du groupe:', JSON.stringify(data, null, 2));
    }
    else {
        console.error('Error when retrieving expenses:', data);
    }
}

async function getSpecificExpense(token, groupId, expenseId) {
    const response = await fetch(`${baseUrl}/groups/${groupId}/expenses/${expenseId}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    });
    const data = await response.json();

    if (response.ok) {
        console.log('Détails de la dépense:', JSON.stringify(data, null, 2));
    }
    else {
        console.error('Erreur lors de la récupération de la dépense:', data);
    }
}


// Fonction principale pour exécuter les actions de création de compte, connexion, création de groupe et affichage
async function main() {
    

    const response = await fetch(`${baseUrl}/users/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: `simon-leclere@orange.fr`,
            password: 'password'
        })
    });
    const data = await response.json();
    if (response.ok) console.log('Utilisateur créé:', data);
    else console.error('Erreur lors de la création du compte:', data);

    return;
    
    
    await registerUser("user", false);
    const token = await loginUser("user", false);
    if (!token) return console.error('Impossible de continuer sans token JWT.');
    
    // await getProfile(token);

    const group = await createGroup(token, false);
    // await getGroups(token);

    
    // create 3 users
    await registerUser("user1", false);
    await registerUser("user2", false);
    await registerUser("user3", false);

    const usersTokens = [
        await loginUser("user1", false),
        await loginUser("user2", false),
        await loginUser("user3", false)
    ];

    const usersIds = [token, ...usersTokens].map(token => jwt.decode(token).userId);

    // add them to the group
    await batchJoinGroup(usersTokens, group.id);

    await getSpecificGroup(token, group.id);

    await addExpense(token, group.id, usersIds);

    await getAllExpenses(token, group.id);

    await getSpecificExpense(token, group.id, 1);

}

// Exécute le script principal
main();
