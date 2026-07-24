import { useState, useEffect } from "react";
import type { Member } from "../stores/membersStore";

import { membersApi } from "../services/api";
import { Modal } from "./ui/modal";
import { 
  User, Mail, MapPin, 
  Activity, Users, CheckCircle, Trash2, Edit3, Save, Tag
} from "lucide-react";

interface MemberProfileProps {
  member: Member;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export default function MemberProfile({ member, isOpen, onClose, onUpdate }: MemberProfileProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  
  // Basic Details Editing
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    first_name: member.first_name,
    last_name: member.last_name,
    email: member.email || "",
    mobile: member.mobile || "",
    primary_address1: member.primary_address1 || "",
    primary_city: member.primary_city || "",
    primary_state: member.primary_state || "",
    primary_zip: member.primary_zip || "",
    custom_attributes: member.custom_attributes || "{}"
  });
  
  // Custom Attributes State
  const [attributes, setAttributes] = useState<Record<string, any>>({});
  const [newAttrKey, setNewAttrKey] = useState("");
  const [newAttrValue, setNewAttrValue] = useState("");

  useEffect(() => {
    if (isOpen) {
      setFormData({
        first_name: member.first_name,
        last_name: member.last_name,
        email: member.email || "",
        mobile: member.mobile || "",
        primary_address1: member.primary_address1 || "",
        primary_city: member.primary_city || "",
        primary_state: member.primary_state || "",
        primary_zip: member.primary_zip || "",
        custom_attributes: member.custom_attributes || "{}"
      });
      try {
        setAttributes(JSON.parse(member.custom_attributes || "{}"));
      } catch (e) {
        setAttributes({});
      }
    }
  }, [member, isOpen]);

  const handleSave = async () => {
    setLoading(true);
    try {
      // Sync attributes to formData
      const updatedData = {
        ...formData,
        custom_attributes: JSON.stringify(attributes)
      };
      
      await membersApi.update(member.id, updatedData);
      setIsEditing(false);
      onUpdate();
    } catch (error) {
      console.error("Failed to update member", error);
    } finally {
      setLoading(false);
    }
  };

  const handleResetStatus = async () => {
    if (!confirm("Are you sure you want to reset verification status? This will clear all check results.")) return;
    setResetting(true);
    try {
      await membersApi.resetStatus(member.id);
      onUpdate();
    } catch (error) {
      console.error("Failed to reset status", error);
    } finally {
      setResetting(false);
    }
  };

  const addAttribute = () => {
    if (!newAttrKey) return;
    setAttributes(prev => ({ ...prev, [newAttrKey]: newAttrValue }));
    setNewAttrKey("");
    setNewAttrValue("");
  };

  const removeAttribute = (key: string) => {
    const newAttrs = { ...attributes };
    delete newAttrs[key];
    setAttributes(newAttrs);
  };

  const getStatusColor = (status: string) => {
    if (status === "Pass" || status === "Verified") return "text-green-500 bg-green-500/10 border-green-500/20";
    if (status === "Partial") return "text-amber-500 bg-amber-500/10 border-amber-500/20";
    if (status === "Fail") return "text-red-500 bg-red-500/10 border-red-500/20";
    return "text-muted-foreground bg-secondary";
  };
  
  const lastCheck = member.check_results?.[member.check_results.length - 1];
  const status = lastCheck?.result === "Pass" ? "Verified" : lastCheck?.result || "Unchecked";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${member.first_name} ${member.last_name}`} size="xl">
      <div className="flex flex-col h-[70vh]">
        {/* Header - Integrated into Modal title typically, but we want custom header content */}
        {/* We can hide default modal header or just put our extended info below it */}
        
        <div className="flex justify-between items-start bg-secondary/20 p-4 -mx-5 -mt-5 mb-0 border-b border-border">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xl font-bold">
                {member.first_name[0]}{member.last_name[0]}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getStatusColor(status)}`}>
                     {status}
                  </span>
                </div>
                <div className="text-muted-foreground flex items-center gap-3 mt-1 text-sm">
                  {member.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {member.email}</span>}
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {member.primary_city}, {member.primary_state}</span>
                </div>
              </div>
            </div>
            {/* Modal has its own close button usually, but we can have our own actions here */}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border bg-card -mx-5 px-5">
            {[
              { id: "overview", icon: User, label: "Overview" },
              { id: "timeline", icon: Activity, label: "Timeline" },
              { id: "relationships", icon: Users, label: "Relationships" },
              { id: "aec", icon: CheckCircle, label: "AEC Check" },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id 
                    ? "border-primary text-foreground bg-primary/5" 
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-1 -mx-5 px-5 py-5 custom-scrollbar">
            
            {activeTab === "overview" && (
              <div className="grid grid-cols-3 gap-8">
                {/* Main Info */}
                <div className="col-span-2 space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-foreground">Basic Information</h3>
                    {!isEditing ? (
                      <button onClick={() => setIsEditing(true)} className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80">
                         <Edit3 className="w-4 h-4" /> Edit
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => setIsEditing(false)} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
                        <button onClick={handleSave} disabled={loading} className="flex items-center gap-1.5 text-sm bg-primary text-primary-foreground px-3 py-1 rounded-md hover:bg-primary/90">
                          <Save className="w-4 h-4" /> Save
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
                    {isEditing ? (
                       <>
                         <div>
                           <label className="block text-xs font-medium text-muted-foreground mb-1">First Name</label>
                           <input type="text" value={formData.first_name} onChange={e => setFormData({...formData, first_name: e.target.value})} className="w-full px-2 py-1 bg-secondary border border-border rounded" />
                         </div>
                         <div>
                           <label className="block text-xs font-medium text-muted-foreground mb-1">Last Name</label>
                           <input type="text" value={formData.last_name} onChange={e => setFormData({...formData, last_name: e.target.value})} className="w-full px-2 py-1 bg-secondary border border-border rounded" />
                         </div>
                         <div className="col-span-2">
                           <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
                           <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-2 py-1 bg-secondary border border-border rounded" />
                         </div>
                         <div>
                           <label className="block text-xs font-medium text-muted-foreground mb-1">Mobile</label>
                           <input type="text" value={formData.mobile} onChange={e => setFormData({...formData, mobile: e.target.value})} className="w-full px-2 py-1 bg-secondary border border-border rounded" />
                         </div>
                         <div className="col-span-2">
                            <label className="block text-xs font-medium text-muted-foreground mb-1">Address</label>
                            <input type="text" value={formData.primary_address1} onChange={e => setFormData({...formData, primary_address1: e.target.value})} className="w-full px-2 py-1 bg-secondary border border-border rounded mb-2" />
                            <div className="grid grid-cols-3 gap-2">
                              <input type="text" placeholder="City" value={formData.primary_city} onChange={e => setFormData({...formData, primary_city: e.target.value})} className="px-2 py-1 bg-secondary border border-border rounded" />
                              <input type="text" placeholder="State" value={formData.primary_state} onChange={e => setFormData({...formData, primary_state: e.target.value})} className="px-2 py-1 bg-secondary border border-border rounded" />
                              <input type="text" placeholder="Zip" value={formData.primary_zip} onChange={e => setFormData({...formData, primary_zip: e.target.value})} className="px-2 py-1 bg-secondary border border-border rounded" />
                            </div>
                         </div>
                       </>
                    ) : (
                      <>
                        <div>
                          <p className="text-muted-foreground text-xs">Full Name</p>
                          <p className="text-foreground">{member.first_name} {member.middle_name} {member.last_name}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">NationBuilder ID</p>
                          <p className="font-mono text-foreground">{member.nationbuilder_id}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Email</p>
                          <p className="text-foreground">{member.email || "-"}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Phone</p>
                          <p className="text-foreground">{member.phone || member.mobile || "-"}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Date of Birth</p>
                          <p className="text-foreground">{member.dob || "-"}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-muted-foreground text-xs">Address</p>
                          <p className="text-foreground">
                            {member.primary_address1} {member.primary_address2}<br/>
                            {member.primary_city} {member.primary_state} {member.primary_zip}
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  <hr className="border-border" />

                  {/* Custom Attributes */}
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-4">Custom Attributes</h3>
                    
                    <div className="bg-secondary/20 rounded-lg p-4 mb-4">
                      {Object.keys(attributes).length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">No custom attributes defined.</p>
                      ) : (
                        <div className="space-y-3">
                          {Object.entries(attributes).map(([key, value]) => (
                            <div key={key} className="flex items-center justify-between p-2 bg-card border border-border rounded group">
                              <div>
                                <span className="text-xs font-medium text-muted-foreground uppercase">{key}</span>
                                <p className="text-sm text-foreground">{value}</p>
                              </div>
                              {isEditing && (
                                <button onClick={() => removeAttribute(key)} className="text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {isEditing && (
                      <div className="flex gap-2">
                         <input 
                           type="text" 
                           placeholder="Attribute Name" 
                           value={newAttrKey}
                           onChange={e => setNewAttrKey(e.target.value)}
                           className="flex-1 px-3 py-2 bg-secondary border border-border rounded text-sm"
                         />
                         <input 
                           type="text" 
                           placeholder="Value" 
                           value={newAttrValue}
                           onChange={e => setNewAttrValue(e.target.value)}
                           className="flex-1 px-3 py-2 bg-secondary border border-border rounded text-sm"
                         />
                         <button onClick={addAttribute} disabled={!newAttrKey} className="px-4 py-2 bg-secondary hover:bg-secondary/80 border border-border rounded text-foreground font-medium text-sm disabled:opacity-50">
                           Add
                         </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sidebar Info */}
                <div className="space-y-6">
                   {/* Verification Status Card */}
                   <div className="bg-secondary/20 rounded-xl p-5 border border-border">
                      <h4 className="font-medium text-foreground mb-3 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-primary" /> Verification
                      </h4>
                      
                      <div className="space-y-3 mb-6">
                        <div className="flex justify-between text-sm">
                           <span className="text-muted-foreground">Status</span>
                           <span className={`font-medium ${getStatusColor(status).split(" ")[0]}`}>{status}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                           <span className="text-muted-foreground">Electorate</span>
                           <span className="font-medium text-foreground">{lastCheck?.federal_division || "-"}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                           <span className="text-muted-foreground">Last Check</span>
                           <span className="text-foreground">{lastCheck?.timestamp ? new Date(lastCheck.timestamp).toLocaleDateString() : "Never"}</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {status !== "Verified" && status !== "Unchecked" && (
                           <button 
                             onClick={handleResetStatus} 
                             disabled={resetting}
                             className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-secondary border border-border text-foreground rounded-lg hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 text-sm font-medium transition-colors"
                           >
                             <Trash2 className="w-4 h-4" /> {resetting ? "Resetting..." : "Reset Status"}
                           </button>
                         )}
                      </div>
                   </div>

                   {/* Tags */}
                   <div className="bg-secondary/20 rounded-xl p-5 border border-border">
                      <h4 className="font-medium text-foreground mb-3 flex items-center gap-2">
                        <Tag className="w-4 h-4 text-primary" /> Tags
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {member.tags?.map((tag: any) => (
                          <span key={tag.id} className="px-2 py-1 text-xs font-medium rounded bg-primary/10 text-primary border border-primary/20">
                            {tag.name}
                          </span>
                        ))}
                        {(!member.tags || member.tags.length === 0) && (
                          <span className="text-sm text-muted-foreground italic">No tags</span>
                        )}
                      </div>
                   </div>
                </div>
              </div>
            )}

            {activeTab === "timeline" && (
              <div className="text-center py-16 text-muted-foreground">
                <Activity className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>Interaction Timeline coming soon...</p>
              </div>
            )}

            {activeTab === "relationships" && (
              <div className="text-center py-16 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>Relationships mapping coming soon...</p>
              </div>
            )}
            
            {activeTab === "aec" && (
              <div className="space-y-4">
                 <h3 className="text-lg font-semibold text-foreground">Verification History</h3>
                 {member.check_results && member.check_results.length > 0 ? (
                   <div className="border border-border rounded-lg overflow-hidden">
                     <table className="w-full text-sm text-left">
                       <thead className="bg-secondary text-muted-foreground font-medium border-b border-border">
                         <tr>
                           <th className="px-4 py-2">Date</th>
                           <th className="px-4 py-2">Result</th>
                           <th className="px-4 py-2">Division</th>
                           <th className="px-4 py-2">Method</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-border">
                         {[...member.check_results].reverse().map((chk, i) => (
                           <tr key={chk.id || i} className="hover:bg-secondary/20">
                             <td className="px-4 py-3 text-muted-foreground">{new Date(chk.timestamp).toLocaleString()}</td>
                             <td className="px-4 py-3 font-medium text-foreground">{chk.result}</td>
                             <td className="px-4 py-3 text-foreground">{chk.federal_division || "-"}</td>
                             <td className="px-4 py-3 text-muted-foreground text-xs">{chk.verification_method}</td>
                           </tr>
                         ))}
                       </tbody>
                     </table>
                   </div>
                 ) : (
                   <p className="text-muted-foreground">No verification checks performed yet.</p>
                 )}
              </div>
            )}

        </div>
      </div>
    </Modal>
  );
}
