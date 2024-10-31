import request from 'supertest';
import { expect } from 'chai';
import { app, db } from '../index.js';
import fs from 'fs';
import path from 'path';

import { port } from '../index.js';
import FormData from 'form-data';

const baseUrl = '/upload';
const profileImagePath = './tests/assets/testProfileImage.jpg';
const profileImagePath2 = './tests/assets/testProfileImage2.jpg';
const groupImagePath = './tests/assets/testGroupImage.jpg';
const expenseImagePath = './tests/assets/testExpenseImage.jpg';

let token;
let userId;
let groupId;
let expenseId;
const imagesToDelete = [];

var supertest = request(app);

describe('Upload Routes', () => {
    before(async () => {
        // Create a test user
        const userRes = await supertest
            .post('/users/register')
            .send({
                username: 'testuserupload',
                email: 'testupload@example.com',
                password: 'testpassword'
            });

        userId = userRes.body.id;

        // User login to obtain token
        const loginRes = await supertest
            .post('/users/login')
            .send({
                email: 'testupload@example.com',
                password: 'testpassword'
            });

        token = loginRes.body.token;

        // Create a group and an expense for tests
        const groupRes = await supertest
            .post('/groups')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Test Group', description: 'A group for testing purposes' });

        groupId = groupRes.body.id;

        const expenseRes = await supertest
            .post(`/groups/${groupId}/expenses`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                groupId,
                amount: 100,
                currency: 'USD',
                label: 'Test Expense',
                type: 'expense',
                payerId: userId,
                splitType: 'even',
                date: new Date().toISOString()
            });

        expenseId = expenseRes.body.id;
    });

    // Tests for /upload/profile
    describe('POST /upload/profile', () => {
        it('should upload a profile image successfully', async () => {
            const res = await supertest
                .post(`${baseUrl}/profile`)
                .set('Authorization', `Bearer ${token}`)
                .attach('image', profileImagePath);

            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('message', 'Profile image successfully updated');
            expect(res.body).to.have.property('imageUrl');
            imagesToDelete.push(res.body.imageUrl);

            db.get(`SELECT profileImage FROM users WHERE id = ?`, [userId], (err, row) => {
                expect(row.profileImage).to.equal(res.body.imageUrl);
            });
        });

        it('should return 400 if no image is provided', async () => {
            const res = await supertest
                .post(`${baseUrl}/profile`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).to.equal(400);
            expect(res.body).to.have.property('error', 'No images provided');
        });

        it('should delete the old image if a new image is uploaded', async () => {
            const initialRes = await supertest
                .post(`${baseUrl}/profile`)
                .set('Authorization', `Bearer ${token}`)
                .attach('image', profileImagePath);

            imagesToDelete.push(initialRes.body.imageUrl);

            const res = await supertest
                .post(`${baseUrl}/profile`)
                .set('Authorization', `Bearer ${token}`)
                .attach('image', profileImagePath2);

            expect(res.status).to.equal(200);
            imagesToDelete.push(res.body.imageUrl);
        });

        it('should return 401 if the user is not authenticated', async () => {
            const file = fs.createReadStream(profileImagePath);
            const formData = new FormData();
            formData.append('image', file);

            const response = await fetch(`http://localhost:${port}${baseUrl}/profile`, {
                method: 'POST',
                body: formData,
            });

            expect(response.status).to.equal(401);
            const json = await response.json();
            expect(json).to.have.property('error', 'Access denied');
        });


    });

    // Tests for /upload/group
    describe('POST /upload/group', () => {
        it('should upload a group image successfully if user is a member', async () => {
            const res = await supertest
                .post(`${baseUrl}/group/${groupId}`)
                .set('Authorization', `Bearer ${token}`)
                .attach('image', groupImagePath);

            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('message', 'Group image successfully updated');
            expect(res.body).to.have.property('imageUrl');
            imagesToDelete.push(res.body.imageUrl);
        });

        it('should return 403 if user is not a member of the group', async () => {
            const res = await supertest
                .post(`${baseUrl}/group/invalidGroupId`)
                .set('Authorization', `Bearer ${token}`)
                .attach('image', groupImagePath);

            expect(res.status).to.equal(403);
            expect(res.body).to.have.property('error', 'You must be a member of the group to modify this image.');
        });

        it('should return 400 if no image is provided', async () => {
            const res = await supertest
                .post(`${baseUrl}/group/${groupId}`)
                .set('Authorization', `Bearer ${token}`)

            expect(res.status).to.equal(400);
            expect(res.body).to.have.property('error', 'No images provided');
        });

        it('should return 403 if the user is not authenticated', async () => {
            const file = fs.createReadStream(groupImagePath);
            const formData = new FormData();
            formData.append('image', file);
          
            const response = await fetch(`http://localhost:${port}${baseUrl}/group/${groupId}`, {
              method: 'POST',
              body: formData,
            });
          
            expect(response.status).to.equal(401);
            const json = await response.json();
            expect(json).to.have.property('error', 'Access denied');
          });
          
    });

    // Tests for /upload/expense
    describe('POST /upload/expense', () => {
        it('should upload an expense image successfully if user is a member of the group', async () => {
            const res = await supertest
                .post(`${baseUrl}/group/${groupId}/expense/${expenseId}`)
                .set('Authorization', `Bearer ${token}`)
                .attach('image', expenseImagePath);

            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('message', 'Expense image successfully updated');
            expect(res.body).to.have.property('imageUrl');
            imagesToDelete.push(res.body.imageUrl);
        });

        it('should return 403 if user is not a member of the group', async () => {
            const res = await supertest
                .post(`${baseUrl}/group/invalidGroupId/expense/${expenseId}`)
                .set('Authorization', `Bearer ${token}`)
                .attach('image', expenseImagePath);

            expect(res.status).to.equal(403);
            expect(res.body).to.have.property('error', 'You must be a member of the group to modify this image.');
        });

        it('should return 400 if no image is provided', async () => {
            const res = await supertest
                .post(`${baseUrl}/group/${groupId}/expense/${expenseId}`)
                .set('Authorization', `Bearer ${token}`)

            expect(res.status).to.equal(400);
            expect(res.body).to.have.property('error', 'No images provided');
        });

        it('should return 401 if the user is not authenticated', async () => {
            const file = fs.createReadStream(expenseImagePath);
            const formData = new FormData();
            formData.append('image', file);
          
            const response = await fetch(`http://localhost:${port}${baseUrl}/group/${groupId}/expense/${expenseId}`, {
              method: 'POST',
              body: formData,
            });
          
            expect(response.status).to.equal(401);
            const json = await response.json();
            expect(json).to.have.property('error', 'Access denied');
          });
          

    });

    // Post-test cleanup to remove uploaded images
    after(async () => {
        for (const imageUrl of imagesToDelete) {
            const imagePath = path.resolve('.', imageUrl);

            // Check if the file exists before trying to delete it
            if (fs.existsSync(imagePath)) {
                fs.unlink(imagePath, (err) => {
                    if (err) {
                        console.error(`Erreur lors de la suppression de l'image: ${imageUrl}`, err);
                    }
                });
            }
        }
    });
});
