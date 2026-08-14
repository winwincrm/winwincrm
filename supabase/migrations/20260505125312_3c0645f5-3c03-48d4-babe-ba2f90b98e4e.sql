-- Revert the 10 leads moved in the previous migration back to their original office/agent
UPDATE leads SET office_id='87154ed9-45d0-4be5-becd-9ec5a6bbb24c', assigned_user_id='0153d0b2-33a5-47df-9f9d-b0b0bf5f838c', updated_at=now() WHERE id='0a830321-e38e-427b-b9cf-50cdf2fa7812';
UPDATE leads SET office_id='e960656f-7111-4258-86f7-f20569f4a0a1', assigned_user_id='410bba8a-e551-4fe9-8a84-9daf42c297ed', updated_at=now() WHERE id='f80248bc-4bcb-44a0-9c10-0a42183268f2';
UPDATE leads SET office_id='e960656f-7111-4258-86f7-f20569f4a0a1', assigned_user_id='3518c74b-4b8a-4e9e-b418-1dd92f8e687d', updated_at=now() WHERE id='d77b8880-8203-402e-9b53-2da1db76e8ed';
UPDATE leads SET office_id='e960656f-7111-4258-86f7-f20569f4a0a1', assigned_user_id='b834c50d-d91e-4a4d-b66d-8d8103c672f7', updated_at=now() WHERE id='790b44eb-a0c5-42cf-a876-b55919e7809d';
UPDATE leads SET office_id='e960656f-7111-4258-86f7-f20569f4a0a1', assigned_user_id='b834c50d-d91e-4a4d-b66d-8d8103c672f7', updated_at=now() WHERE id='854227b3-593b-45ef-ad55-3d25e86e67d6';
UPDATE leads SET office_id='87154ed9-45d0-4be5-becd-9ec5a6bbb24c', assigned_user_id='0153d0b2-33a5-47df-9f9d-b0b0bf5f838c', updated_at=now() WHERE id='1ed0bbda-1c88-48dd-b795-ef144fa21235';
UPDATE leads SET office_id='45695eb5-e837-4958-bab1-467de7378988', assigned_user_id='c03ac0e8-7cbc-4d5b-898a-562b4919e97b', updated_at=now() WHERE id='266ea8b6-6776-4bc2-b20c-9caf518a8bd4';
UPDATE leads SET office_id='87154ed9-45d0-4be5-becd-9ec5a6bbb24c', assigned_user_id='0153d0b2-33a5-47df-9f9d-b0b0bf5f838c', updated_at=now() WHERE id='dbae2db5-7cce-4714-a5b2-d98d85fb8f97';
UPDATE leads SET office_id='87154ed9-45d0-4be5-becd-9ec5a6bbb24c', assigned_user_id='0153d0b2-33a5-47df-9f9d-b0b0bf5f838c', updated_at=now() WHERE id='ac84f482-78bf-4fc5-9e65-0e3dae2d53c6';
UPDATE leads SET office_id='45695eb5-e837-4958-bab1-467de7378988', assigned_user_id='c03ac0e8-7cbc-4d5b-898a-562b4919e97b', updated_at=now() WHERE id='448cfbc3-dc34-4560-becc-bcd110c46d04';