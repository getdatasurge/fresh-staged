/**
 * Annotations Widget
 *
 * View and add notes, comments, and shift handoff information.
 * Persists notes to event_logs table via tRPC.
 * Displays author name/email and timestamp for each annotation.
 * Allows managers/admins to delete annotations.
 */

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare, Plus, Loader2, X, Trash2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC, useTRPCClient } from '@/lib/trpc';
import type { WidgetProps } from '../types';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/useUserRole';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Annotation {
  id: string;
  title: string | null;
  event_data: {
    note?: string;
    message?: string;
  };
  recorded_at: string | Date;
  actor_id: string | null;
  author_name: string | null;
  author_email: string | null;
}

export function AnnotationsWidget({ entityId, organizationId }: WidgetProps) {
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [annotationToDelete, setAnnotationToDelete] = useState<Annotation | null>(null);

  const { canManageAnnotations } = usePermissions();

  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();

  // Query options for annotations
  const queryOptions = trpc.readings.listEventLogs.queryOptions({
    organizationId: organizationId!,
    unitId: entityId!,
    eventTypes: ['note_added', 'comment', 'shift_handoff', 'annotation'],
    limit: 20,
  });

  const { data: rawAnnotations, isLoading } = useQuery({
    ...queryOptions,
    enabled: !!entityId && !!organizationId,
  });

  // Transform tRPC response to match expected Annotation interface
  const annotations = useMemo((): Annotation[] => {
    if (!rawAnnotations) return [];
    return rawAnnotations.map((a) => ({
      id: a.id,
      title: a.title,
      event_data: (a.eventData ?? {}) as { note?: string; message?: string },
      recorded_at: a.recordedAt,
      actor_id: a.actorId,
      author_name: a.authorName,
      author_email: a.authorEmail,
    }));
  }, [rawAnnotations]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (noteContent: string) => {
      return client.readings.createEventLog.mutate({
        organizationId: organizationId!,
        unitId: entityId!,
        eventType: 'note_added',
        eventData: { note: noteContent },
      });
    },
    onSuccess: () => {
      toast.success('Note added');
      setNoteText('');
      setIsAddingNote(false);
      queryClient.invalidateQueries({ queryKey: queryOptions.queryKey });
    },
    onError: () => {
      toast.error('Failed to add note');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (eventLogId: string) => {
      return client.readings.deleteEventLog.mutate({
        organizationId: organizationId!,
        eventLogId,
      });
    },
    onSuccess: () => {
      toast.success('Annotation deleted');
      setAnnotationToDelete(null);
      queryClient.invalidateQueries({ queryKey: queryOptions.queryKey });
    },
    onError: () => {
      toast.error('Failed to delete annotation');
    },
  });

  const handleSaveNote = () => {
    if (!noteText.trim()) return;
    createMutation.mutate(noteText.trim());
  };

  const handleCancel = () => {
    setIsAddingNote(false);
    setNoteText('');
  };

  const handleDeleteAnnotation = () => {
    if (!annotationToDelete) return;
    deleteMutation.mutate(annotationToDelete.id);
  };

  const getAuthorDisplay = (annotation: Annotation): string => {
    if (annotation.author_name) {
      return annotation.author_name;
    }
    if (annotation.author_email) {
      return annotation.author_email;
    }
    return 'Unknown user';
  };

  const formatTimestamp = (dateValue: string | Date): string => {
    try {
      const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
      return format(date, 'MMM d, yyyy · h:mm a');
    } catch {
      return 'Unknown time';
    }
  };

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Annotations
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Annotations
          </CardTitle>
          {!isAddingNote && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => setIsAddingNote(true)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden flex flex-col">
          {isAddingNote && (
            <div className="p-3 border rounded-lg mb-3 space-y-2 bg-muted/30">
              <Textarea
                placeholder="Enter your note..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={3}
                className="resize-none"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
                  disabled={createMutation.isPending}
                >
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveNote}
                  disabled={createMutation.isPending || !noteText.trim()}
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Note'
                  )}
                </Button>
              </div>
            </div>
          )}

          {annotations.length === 0 && !isAddingNote ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No annotations yet</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setIsAddingNote(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Note
              </Button>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="space-y-3">
                {annotations.map((annotation) => {
                  const noteContent =
                    annotation.event_data?.note ||
                    annotation.event_data?.message ||
                    annotation.title ||
                    'No content';

                  return (
                    <div
                      key={annotation.id}
                      className="p-3 rounded-lg border border-border bg-muted/30 group"
                    >
                      {/* Header: Author + Timestamp + Delete */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/80">
                            {getAuthorDisplay(annotation)}
                          </span>
                          <span>·</span>
                          <span>{formatTimestamp(annotation.recorded_at)}</span>
                        </div>
                        {canManageAnnotations && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                            onClick={() => setAnnotationToDelete(annotation)}
                            aria-label="Delete annotation"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      {/* Content */}
                      <p className="text-sm whitespace-pre-wrap">{noteContent}</p>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!annotationToDelete} onOpenChange={() => setAnnotationToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Annotation?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The annotation will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAnnotation}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
