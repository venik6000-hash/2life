import { useState } from "react";
import { useDashboard } from "../context/DashboardContext";
import { useAuth } from "../context/AuthContext";
import { sortClientsByName } from "../utils/clientSort";
import SidebarClientPicker from "../components/SidebarClientPicker";
import SidebarFooter from "../components/SidebarFooter";
import SidebarLogoToggle from "../components/SidebarLogoToggle";
import SidebarNavList from "../components/SidebarNavList";
import SidebarShell from "../components/SidebarShell";
import SidebarStageList from "../components/SidebarStageList";

export default function Sidebar() {
  const {
    so, setSo, pk, setPk, cls, cl, cid, si, setSi, sec, setSec, setCid, setPri, setMd, removeStage,
    visibleSections, canCreateClient, canWriteSection, renameClientById,
  } = useDashboard();
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const city = cl ? (cl.stages?.[si]?.city ?? cl.city ?? "") : "";
  const sortedClients = sortClientsByName(cls);
  const canRenameClients = user?.role === "admin";

  const handleRenameClient = (client) => {
    if (!canRenameClients) return;
    const currentName = String(client?.name || client?.shortName || "").trim();
    const nextName = prompt("Новое имя клиента:", currentName);
    if (nextName == null) return;
    const cleaned = String(nextName).trim();
    if (!cleaned) { alert("Имя клиента не может быть пустым"); return; }
    renameClientById(client.id, cleaned);
  };

  const handleSelectClient = (client) => {
    setCid(client.id);
    setSi(0);
    setPk(false);
    setSec("overview");
    setPri(0);
  };

  const handleCreateClient = () => {
    setMd("newCl");
    setPk(false);
  };

  const handleSelectStage = (index) => {
    setSi(index);
    setPri(0);
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try { await logout(); } finally { setLoggingOut(false); }
  };

  return (
    <SidebarShell
      expanded={so}
      header={<SidebarLogoToggle expanded={so} onToggle={() => setSo(!so)} />}
      clientPicker={(
        <SidebarClientPicker
          expanded={so}
          client={cl}
          city={city}
          open={pk}
          clients={sortedClients}
          activeClientId={cid}
          canRename={canRenameClients}
          canCreate={canCreateClient}
          onToggle={() => setPk(!pk)}
          onSelectClient={handleSelectClient}
          onRenameClient={handleRenameClient}
          onCreateClient={handleCreateClient}
        />
      )}
      stages={so ? (
        <SidebarStageList
          stages={cl.stages}
          activeIndex={si}
          canEdit={canWriteSection("overview")}
          onSelectStage={handleSelectStage}
          onDeleteStage={removeStage}
          onCreateStage={() => setMd("newSt")}
        />
      ) : null}
      navigation={(
        <SidebarNavList
          expanded={so}
          sections={visibleSections}
          activeSectionId={sec}
          onSelectSection={setSec}
        />
      )}
      footer={(
        <SidebarFooter
          expanded={so}
          username={user?.username}
          isAdmin={user?.role === "admin"}
          adminActive={sec === "admin"}
          loggingOut={loggingOut}
          onOpenAdmin={() => setSec("admin")}
          onLogout={handleLogout}
        />
      )}
    />
  );
}
