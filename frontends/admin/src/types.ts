export interface UserInfo {
  id: string;
  email: string;
  full_name: string;
  role: string;
  sector?: string;
  citizen_id?: string;
}

export interface AuthData {
  token: string;
  user: UserInfo;
}

export interface Citizen {
  citizen_id: string;
  full_name: string;
  sex: string;
  year_of_birth: number;
  district_of_birth: string;
  nationality: string;
  status: string;
  photo_url?: string;
  family: {
    father_citizen_id?: string;
    mother_citizen_id?: string;
    spouse_citizen_id?: string;
    children: string[];
  };
  sectors: {
    education: SectorBlock;
    revenue: SectorBlock;
    labour: SectorBlock;
    health: SectorBlock;
  };
}

export interface SectorBlock {
  visible: boolean;
  data?: any;
  reason?: string;
  message?: string;
}
