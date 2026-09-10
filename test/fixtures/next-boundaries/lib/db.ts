export class DatabaseConnection {
  host = "localhost";
  query() {
    return [];
  }
}

export const dbInstance = new DatabaseConnection();
