
export class UserManager {
  constructor(private db: any) {}

  public async createUser(user: any) {
    try {
      await this.db.insert('users', user);
      // missing logic
    } catch (err) {
      console.error('Failed to create user', err);
      throw err;
    }
  }

  public async processData(data: any) {
       // logic without try/catch
       await this.db.process(data);
  }
}

function helper() {
   return 1;
}
