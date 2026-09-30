export type Role='Director'|'Principal'|'HOD'|'Coordinator'|'Coordinators'|'Faculty / Volunteers'|'Super Admin'|'Meeting Secretary'|'Faculty / Officer'|'Member'|'Auditor';
export type MeetingStatus='Draft'|'Transcribed'|'Pending Approval'|'Approved'|'Rejected'|'Published';
export type MeetingType='online'|'offline';
export type ActionStatus='Pending'|'In Progress'|'Completed';
export interface Profile{ id:string; email:string; role:Role; department:string|null; created_at:string; }
export interface Meeting{ id:string; title:string; date:string; location:string|null; type:MeetingType; status:MeetingStatus; created_by:string; assigned_approver_id:string|null; }
export interface Decision{ id:string; meeting_id:string; minute_id:string; decision_text:string; action_item:string|null; assignee_id:string|null; due_date:string|null; status:ActionStatus; }
export interface ActionItem{ id:string; meeting_id:string; decision_id:string|null; task:string; assignee_id:string|null; due_date:string|null; priority:'Low'|'Medium'|'High'|'Critical'; status:ActionStatus; created_by:string; created_at:string; updated_at:string; }
export interface TaskReport{ id:string; action_item_id:string; submitted_by:string; file_path:string; file_name:string; mime_type:string|null; file_size:number|null; notes:string|null; created_at:string; }
export interface SearchResult{parent_type:string;parent_id:string;chunk_content:string;metadata:Record<string,unknown>;similarity:number;}
export interface AIActionItem{decision_text:string;action_item:string;assignee_email:string|null;due_date:string|null;}
export interface AISummary{executive_summary:string;key_points:string[];risks:string[];next_steps:string[];suggested_minutes?:string;}
export interface Suggestion{ id:string; submitted_by:string; title:string; content:string; status:'Submitted'|'Under Review'|'Accepted'|'Rejected'|'Implemented'; reviewer_id:string|null; review_notes:string|null; created_at:string; updated_at:string; }
