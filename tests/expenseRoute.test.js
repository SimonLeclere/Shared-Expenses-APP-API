import request from 'supertest';
import { expect } from 'chai';
import { app } from '../index.js';

const baseUrl = '/groups';
let token;
let groupId;
let expenseId;

// Helper function to create a test group
const createTestGroup = async () => {

    const res = await request(app)
        .post('/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test Group' });    
    
    return res.body.id;
};

describe('Expense Routes', () => {
    // Before all tests, create a user account, login to get a token, and create a group
    before(async () => {
        await request(app)
            .post('/users/register')
            .send({
                username: 'testuser2',
                email: 'test2@example.com',
                password: 'testpassword'
            });

        
        const loginRes = await request(app)
            .post('/users/login')
            .send({
                email: 'test2@example.com',
                password: 'testpassword'
            });
        token = loginRes.body.token;        

        groupId = await createTestGroup();

    });

    // Test to add an expense
    describe('POST /groups/:groupId/expenses', () => {
        it('should create a new expense', async () => {
            const res = await request(app)
                .post(`${baseUrl}/${groupId}/expenses`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    amount: 100,
                    currency: 'USD',
                    label: 'Dinner',
                    type: 'dinner',
                    splitType: 'shares',
                    date: '2024-10-30',
                    image: null,
                    users: ['user1', 'user2'],
                    splitValues: { user1: 50, user2: 50 }
                });            

            expect(res.status).to.equal(201);
            expect(res.body).to.have.property('id');
            expect(res.body).to.have.property('amount', 100);
            expenseId = res.body.id;
        });

        it('should return 400 if required fields are missing', async () => {
            const res = await request(app)
                .post(`${baseUrl}/${groupId}/expenses`)
                .set('Authorization', `Bearer ${token}`)
                .send({});

            expect(res.status).to.equal(400);
            expect(res.body).to.have.property('error');
        });
    });

    // Test to recover expenses
    describe('GET /groups/:groupId/expenses', () => {
        it('should retrieve all expenses for a group', async () => {
            const res = await request(app)
                .get(`${baseUrl}/${groupId}/expenses`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).to.equal(200);
            expect(res.body).to.be.an('array');
            expect(res.body).to.have.lengthOf.at.least(1);
        });
    });

    // Test to recover a specific expense
    describe('GET /groups/:groupId/expenses/:expenseId', () => {
        it('should retrieve the expense details', async () => {
            const res = await request(app)
                .get(`${baseUrl}/${groupId}/expenses/${expenseId}`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('id', expenseId);
            expect(res.body).to.have.property('amount', 100);
        });

        it('should return 404 for a non-existing expense', async () => {
            const res = await request(app)
                .get(`${baseUrl}/${groupId}/expenses/99999`) // Non-existing expense ID
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).to.equal(404);
            expect(res.body).to.have.property('error', 'Expenses not found');
        });
    });

    describe('PUT /groups/:groupId/expenses/:expenseId', () => {
        it('should update the existing expense and verify fields', async () => {
            // Recover expense before updating
            const initialResponse = await request(app)
                .get(`${baseUrl}/${groupId}/expenses/${expenseId}`)
                .set('Authorization', `Bearer ${token}`);
    
            const initialExpense = initialResponse.body;
    
            const res = await request(app)
                .put(`${baseUrl}/${groupId}/expenses/${expenseId}`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    amount: 120,
                    currency: 'USD',
                    label: 'Updated Dinner',
                    type: 'dinner',
                    splitType: 'shares',
                    date: '2024-10-31',
                    image: null,
                    users: ['user1', 'user2'],
                    splitValues: { user1: 60, user2: 60 }
                });
    
            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('message', 'Expense successfully updated');
    
            const updatedResponse = await request(app)
                .get(`${baseUrl}/${groupId}/expenses/${expenseId}`)
                .set('Authorization', `Bearer ${token}`);
    
            const updatedExpense = updatedResponse.body;
    
            expect(updatedExpense).to.have.property('amount', 120);
            expect(updatedExpense).to.have.property('currency', 'USD');
            expect(updatedExpense).to.have.property('label', 'Updated Dinner');
            expect(updatedExpense).to.have.property('type', 'dinner');
            expect(updatedExpense).to.have.property('splitType', 'shares');
            expect(updatedExpense).to.have.property('date', '2024-10-31');
    
            expect(updatedExpense).to.have.property('image', initialExpense.image);
        });
    
        it('should return 404 if trying to update a non-existing expense', async () => {
            const res = await request(app)
                .put(`${baseUrl}/${groupId}/expenses/99999`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    amount: 150,
                    currency: 'USD',
                    label: 'Non-existent expense'
                });
    
            expect(res.status).to.equal(404);
            expect(res.body).to.have.property('error', 'Expenses not found');
        });
    });
    

    // Test to delete an expense
    describe('DELETE /groups/:groupId/expenses/:expenseId', () => {
        it('should delete the existing expense', async () => {
            const res = await request(app)
                .delete(`${baseUrl}/${groupId}/expenses/${expenseId}`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('message', 'Expense and its distribution values successfully deleted');
        });

        it('should return 404 if trying to delete a non-existing expense', async () => {
            const res = await request(app)
                .delete(`${baseUrl}/${groupId}/expenses/99999`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).to.equal(404);
            expect(res.body).to.have.property('error', 'Expenses not found');
        });
    });
});

// Authentication middleware test
describe('authenticateToken', () => {
    it('should return 401 if no token is provided', async () => {
        const res = await request(app)
            .get(`${baseUrl}/${groupId}/expenses`);

        expect(res.status).to.equal(401);
        expect(res.body).to.have.property('error');
    });

    it('should return 403 for an invalid token', async () => {
        const res = await request(app)
            .get(`${baseUrl}/${groupId}/expenses`)
            .set('Authorization', 'Bearer invalidtoken');

        expect(res.status).to.equal(403);
        expect(res.body).to.have.property('error');
    });
});
