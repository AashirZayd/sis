import { ClientCard } from "../components/ClientCard.js";
import { getSafeProfile } from "./actions.js";
import { dbInstance } from "../lib/db.js";

export default function Page() {
  const user = { name: "Bob" };

  return (
    <div>
      {/* 1. Safe props */}
      <ClientCard
        title="Valid Card"
        count={42}
        user={user}
        onAction={getSafeProfile}
      />

      {/* 2. Serialization violation: unmarked inline function callback */}
      <ClientCard
        title="Invalid Callback"
        onClick={() => {
          console.log("clicked");
        }}
      />

      {/* 3. Serialization violation: DB connection instance */}
      <ClientCard
        title="Invalid DB Instance"
        db={dbInstance}
      />

      {/* 4. Taint violation: sensitive environment variable passed directly as prop */}
      <ClientCard
        title="Leaked Secret"
        token={process.env.SESSION_SECRET}
      />
    </div>
  );
}
