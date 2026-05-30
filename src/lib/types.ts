export interface User {
  id: string; email: string; name: string; avatar_url: string; created_at: string;
}

export interface Project {
  id: string; user_id: string; name: string; description: string;
  status: "active" | "archived"; thumbnail_url: string | null;
  pin_count: number; shared_emails: string[];
  created_at: string; updated_at: string;
}

export interface Version {
  id: string; project_id: string; version_number: number;
  storage_path: string; created_at: string; created_by: string;
}

export interface Pin {
  id: string; project_id: string; version_id: string | null;
  x_percent: number; y_percent: number; selector: string | null;
  status: "open" | "resolved" | "reopened";
  created_by: string; created_at: string; updated_at: string;
}

export interface PinComment {
  id: string; pin_id: string; user_id: string; content: string;
  parent_id: string | null; edited_at: string | null; created_at: string;
}

export interface ActivityFeed {
  id: string; project_id: string; user_id: string;
  action: string; target: string | null; created_at: string;
}
