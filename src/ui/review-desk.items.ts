import type { FolderItem } from './folder.item';
import type { FileItem } from './file.item';
import type { MessageItem } from './message.item';
import type { SourceItem } from './source.item';

export type ReviewDeskItem = SourceItem | FolderItem | FileItem | MessageItem;
