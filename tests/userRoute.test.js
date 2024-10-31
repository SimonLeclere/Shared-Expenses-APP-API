import request from 'supertest';
import { expect } from 'chai';

import { app } from '../index.js';

const baseUrl = '/users';
let token;

describe('User Routes', () => {

  // Test for user registration
  describe('POST /register', () => {
      it('should create a new user', async () => {
      const res = await request(app)
        .post(`${baseUrl}/register`)
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: 'testpassword'
        });

      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('id');
      expect(res.body).to.have.property('username', 'testuser');
      expect(res.body).to.have.property('email', 'test@example.com');
    });

    it('should return 400 if fields are missing', async () => {
      const res = await request(app)
        .post(`${baseUrl}/register`)
        .send({ username: 'testuser' }); // email and password missing

      expect(res.status).to.equal(400);
      expect(res.body).to.have.property('error');
    });

    it('should return 400 if a user already exists with the same email', async () => {
      const res = await request(app)
        .post(`${baseUrl}/register`)
        .send({
          username: 'testuser2',
          email: 'test@example.com',
          password: 'testpassword'
        });

      expect(res.status).to.equal(400);
      expect(res.body).to.have.property('error');
    });

    it('should return 400 if a user already exists with the same username', async () => {
      const res = await request(app)
        .post(`${baseUrl}/register`)
        .send({
          username: 'testuser',
          email: 'test2@example.com',
          password: 'testpassword'
        });

      expect(res.status).to.equal(400);
      expect(res.body).to.have.property('error');
    });

  });

  // Test for user login
  describe('POST /login', () => {
    it('should login an existing user and return a token', async () => {
      const res = await request(app)
        .post(`${baseUrl}/login`)
        .send({
          email: 'test@example.com',
          password: 'testpassword'
        });

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('token');
      token = res.body.token;
    });

    it('should return 401 for incorrect password', async () => {
      const res = await request(app)
        .post(`${baseUrl}/login`)
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        });

      expect(res.status).to.equal(401);
      expect(res.body).to.have.property('error');
    });
  });

  // Test to retrieve a user's profile
  describe('GET /profile', () => {
    it('should return the user profile when authenticated', async () => {
      const res = await request(app)
        .get(`${baseUrl}/profile`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('username', 'testuser');
      expect(res.body).to.have.property('email', 'test@example.com');
    });

    it('should return 401 if not authenticated', async () => {
      const res = await request(app)
        .get(`${baseUrl}/profile`);

      expect(res.status).to.equal(401);
      expect(res.body).to.have.property('error');
    });
  });

  // Test to update a user's profile
  describe('PUT /profile', () => {
    it('should update the user profile', async () => {
      const res = await request(app)
        .put(`${baseUrl}/profile`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          username: 'updateduser',
          email: 'updated@example.com'
        });

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('message', 'Profile successfully updated');
    });

    it('should return 400 if no fields are provided to update', async () => {
      const res = await request(app)
        .put(`${baseUrl}/profile`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).to.equal(400);
      expect(res.body).to.have.property('error');
    });
  });
});

// JWT token authentication test
describe('authenticateToken', () => {
  it('should return 401 if no token is provided', async () => {
    const res = await request(app)
      .get(`${baseUrl}/profile`);

    expect(res.status).to.equal(401);
    expect(res.body).to.have.property('error');
  });

  it('should return 403 for an invalid token', async () => {
    const res = await request(app)
      .get(`${baseUrl}/profile`)
      .set('Authorization', 'Bearer invalidtoken');

    expect(res.status).to.equal(403);
    expect(res.body).to.have.property('error');
  });
});