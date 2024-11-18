import request from 'supertest';
import { expect } from 'chai';
import { app, db } from '../index.js';
import jwt from 'jsonwebtoken';

const baseUrl = '/groups';
const secret = process.env.JWT_SECRET;

const createToken = (userId) => {
  return jwt.sign({ userId }, secret, { expiresIn: '1h' });
};

describe('Group Routes', () => {
  let groupId;
  let groupJoinCode;
  let token;
  let userToken;

  before(async () => {
    token = createToken(1);
    userToken = createToken(2);
  });

  // Test to create a group
  describe('POST /groups', () => {
    it('should create a new group and add the owner as a member', async () => {
      const res = await request(app)
        .post(baseUrl)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test Group', description: 'A group for testing' });

      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('id');
      expect(res.body).to.have.property('name', 'Test Group');
      expect(res.body).to.have.property('description', 'A group for testing');
      
      groupId = res.body.id;
      groupJoinCode = res.body.joinCode;
    });

    it('should return 422 if name is missing', async () => {
      const res = await request(app)
        .post(baseUrl)
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'A group without a name' });

      expect(res.status).to.equal(422);
      expect(res.body).to.have.property('error');
    });

    it('should return 422 if name is invalid', async () => {
      const res = await request(app)
        .post(baseUrl)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '', description: 'Invalid group' });

      expect(res.status).to.equal(422);
      expect(res.body).to.have.property('error');
    });
  });

  // Test to retrieve all groups
  describe('GET /groups', () => {
    it('should retrieve all groups', async () => {
      const res = await request(app)
        .get(baseUrl)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.be.an('array');
    });
  });

  // Test to retrieve a specific group
  describe('GET /groups/:id', () => {
    it('should retrieve a group by ID', async () => {
      const res = await request(app)
        .get(`${baseUrl}/${groupId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('id', groupId);
    });

    it('should return 403 for non-existent group', async () => {
      const res = await request(app)
        .get(`${baseUrl}/9999`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).to.equal(403);
      expect(res.body).to.have.property('error', 'You must be a member of this group to view it');
    });
  });

  // Test to update a group
  describe('PUT /groups/:id', () => {
    it('should update an existing group', async () => {
      const res = await request(app)
        .put(`${baseUrl}/${groupId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Group', description: 'Updated description' });

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('message', 'Group successfully updated');
    });

    it('should return 400 if name is missing during update', async () => {
      const res = await request(app)
        .put(`${baseUrl}/${groupId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'Description only' });

      expect(res.status).to.equal(400);
      expect(res.body).to.have.property('errors').that.includes('The group name is required and must be a valid string.');
    });

    it('should return 403 if the user is not the owner of the group', async () => {
      const res = await request(app)
        .put(`${baseUrl}/${groupId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Unauthorized Update', description: 'Trying to update' });

      expect(res.status).to.equal(403);
      expect(res.body).to.have.property('error', 'You must be a member of this group to update it.');
    });
  });

  // Test to join a group
  describe('POST /groups/:id/join', () => {
    it('should allow a user to join an existing group', async () => {
      const res = await request(app)
        .post(`${baseUrl}/${groupJoinCode}/join`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('message', 'You have successfully joined the group');
    });

    it('should return 404 for joining a non-existent group', async () => {
      const res = await request(app)
        .post(`${baseUrl}/9999/join`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).to.equal(404);
      expect(res.body).to.have.property('error', 'Group not found');
    });

    it('should return 400 if the user is already a member of the group', async () => {
      const res = await request(app)
        .post(`${baseUrl}/${groupJoinCode}/join`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).to.equal(400);
      expect(res.body).to.have.property('error', 'You are already a member of this group');
    });
  });

  // Test to leave a group
describe('POST /groups/:id/leave', () => {
  let groupIdWithMembers;
  let groupIdWithoutMembers;
  let groupJoinCodeWithMembers;

  before(async () => {
    // Create a group with several members
    const groupWithMembers = await request(app)
      .post(baseUrl)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Group with Members', description: 'Group to test owner leaving' });

    groupIdWithMembers = groupWithMembers.body.id;
    groupJoinCodeWithMembers = groupWithMembers.body.joinCode;

    await request(app)
      .post(`${baseUrl}/${groupJoinCodeWithMembers}/join`)
      .set('Authorization', `Bearer ${userToken}`);

// Create a single-member group (owner only)
    const groupWithoutMembers = await request(app)
      .post(baseUrl)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Group without Members', description: 'Group to test deletion on owner leave' });

    groupIdWithoutMembers = groupWithoutMembers.body.id;
  });

  it('should transfer owner role to another user if owner leaves and members remain', async () => {
    const res = await request(app)
      .post(`${baseUrl}/${groupIdWithMembers}/leave`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('message', 'You have left the group and a new owner has been assigned.');

    // Check that the new user has become owner
    const groupCheck = await request(app)
      .get(`${baseUrl}/${groupIdWithMembers}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(groupCheck.status).to.equal(200);
    expect(groupCheck.body).to.have.property('ownerId', 2);
  });

  it('should delete the group if the owner leaves and no members remain', async () => {
    const res = await request(app)
      .post(`${baseUrl}/${groupIdWithoutMembers}/leave`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('message', 'You left and the group was deleted as there were no more members.');

    db.get(`SELECT * FROM groups WHERE id = ?`, [groupIdWithoutMembers], (err, row) => {
      expect(row).to.be.undefined;
    });
  });

  it('should return 404 for leaving a non-existent group', async () => {
    const res = await request(app)
      .post(`${baseUrl}/9999/leave`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).to.equal(403);
    expect(res.body).to.have.property('error', 'You are not part of this group');
  });

  it('should return 403 if the user is not a member of the group', async () => {
    const res = await request(app)
      .post(`${baseUrl}/${groupIdWithMembers}/leave`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).to.equal(403);
    expect(res.body).to.have.property('error', 'You are not part of this group');
  });
});


  // Test to delete a group
  describe('DELETE /groups/:id', () => {
    it('should return 403 if the user is not the owner of the group', async () => {
      const res = await request(app)
        .delete(`${baseUrl}/${groupId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).to.equal(403);
      expect(res.body).to.have.property('error', "You are not authorized to delete this group.");
    });
    it('should delete an existing group', async () => {
      const res = await request(app)
        .delete(`${baseUrl}/${groupId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('message', 'Group successfully deleted');
    });

    it('should return 404 for non-existent group deletion', async () => {
      const res = await request(app)
        .delete(`${baseUrl}/9999`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).to.equal(404);
      expect(res.body).to.have.property('error', 'Group not found');
    });
  });
});
