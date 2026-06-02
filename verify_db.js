const { initDb, dbAll } = require('./server/db');

async function test() {
  console.log('Initializing Database...');
  await initDb();

  console.log('\n--- USERS ---');
  const users = await dbAll('SELECT * FROM User');
  console.log(users);

  console.log('\n--- POSTS ---');
  const posts = await dbAll('SELECT * FROM Post');
  console.log(posts);

  console.log('\n--- COMMENTS ---');
  const comments = await dbAll('SELECT * FROM Comment');
  console.log(comments);

  console.log('\nDatabase verification successful.');
}

test().catch(err => {
  console.error('Test failed:', err);
});
