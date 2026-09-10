import { ClientCard } from "./ClientCard";

export function ServerCard() {
  // Non-transferable hazard: Ordinary function without "use server" cannot cross Server -> Client boundary
  const handleSelect = () => {
    console.log("Selected card");
  };

  return <ClientCard title="Server Rendered Card" onSelect={handleSelect} />;
}
