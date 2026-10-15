export interface Study {
  dataset?: any[];
  accession_id?: string;
  title?: string;
  grant?: any[];
  funding_statement?: string;
  doi?: string; 
  release_date?: string; 
  author?: any[]; 
  related_publication?: any[];
  see_also?: any[];
  acknowledgement?: string;
  additional_metadata?: any;
  description?: string;
  licence?: string;
  licence_details: Licence;
  keyword?: any[]
  image?: any[]
  annotation_type?: any[]
  pdb_accession?: string[];
  emdb_accession?: string[];
}
export interface Studies {
    accession_id: Study;
}

export interface Licence {
  uri?: string | null;
  log_uri?: string | null;
  label?: string | null;
}

/** Scientific fields remain opaque until their owning metadata renderer interprets them. */
interface MetadataRecord {
  [key: string]: unknown;
}

export interface ImageCreationProcess {
  input_image_uuid?: string[] | null;
  subject?: SpecimenInfo | null;
  acquisition_process?: MetadataRecord[] | null;
  annotation_method?: MetadataRecord[] | null;
  protocol?: MetadataRecord[] | null;
}

export interface Image {
  representation: ImageRep[];
  uuid: string;
  additional_metadata?: { name?: string | null; provenance?: string | null; value?: unknown }[] | null;
  file_path?: string[] | null;
  total_size_in_bytes?: number | null;
  submission_dataset_uuid?: string | null;
  creation_process?: ImageCreationProcess | null;
  licence_details?: Licence | null;
  accession_id?: string | null;
  file_list_attributes?: { value?: { attributes?: Record<string, unknown> | null } | null }[] | null;
  specimen_track_position?: string | null;
  upstream_image_uuids?: string[] | null;
  segmentation_image_uuids?: string[] | null;
}

export interface SpecimenInfo {
  uuid?: string | null;
  sample_of?: MetadataRecord[] | null;
  imaging_preparation_protocol?: MetadataRecord[] | null;
  [key: string]: unknown;
}

export interface ImageRep {
  uuid?: string | null;
  image_format?: string | null;
  file_uri?: string[] | null;
  size_x?: number | null;
  size_y?: number | null;
  size_z?: number | null;
  size_c?: number | null;
  size_t?: number | null;
  voxel_physical_size_x?: number | null;
  voxel_physical_size_y?: number | null;
  voxel_physical_size_z?: number | null;
  [key: string]: unknown;
}
