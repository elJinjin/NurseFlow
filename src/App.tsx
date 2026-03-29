/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, useState, useEffect, useRef, useMemo } from 'react';
import { Auth } from './Auth';
import { 
  QrCode, 
  User, 
  Activity, 
  ShieldAlert, 
  History, 
  Plus, 
  ChevronLeft, 
  ChevronRight,
  LogOut, 
  Search, 
  Heart, 
  Thermometer, 
  Droplets, 
  Wind, 
  Phone, 
  AlertCircle,
  CheckCircle2,
  XCircle,
  Pill,
  Clock,
  AlertTriangle,
  Stethoscope,
  Trash2,
  Edit2,
  HeartPulse
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  signOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  getDocs,
  setDoc, 
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp, 
  getDocFromServer,
  arrayUnion,
  Timestamp
} from 'firebase/firestore';
import { format } from 'date-fns';
import { auth, db } from './firebase';
import { cn } from './lib/utils';

// --- Types ---

interface MedicationLog {
  id: string;
  medicationName: string;
  dosage: string;
  route: string;
  administeredAt: any;
  administeredBy: string;
  administeredByName: string;
}

interface ScheduledMedication {
  id: string;
  medicationName: string;
  dosage: string;
  route: string;
  frequency: string;
  nextDue: any;
}

interface Patient {
  id: string;
  fullName: string;
  dateOfBirth: string;
  gender: 'Male' | 'Female' | 'Other';
  bloodType: string;
  allergies: string[];
  chronicConditions: string[];
  currentMedications: string[];
  emergencyContact: {
    name: string;
    relationship: string;
    phone: string;
  };
  lastVitals?: {
    bloodPressure: string;
    heartRate: number;
    temperature: number;
    spo2: number;
    recordedAt: any;
  };
  status?: 'Stable' | 'Critical' | 'Observation';
  room?: string;
  createdAt: any;
  updatedAt: any;
}

interface ShiftNote {
  id: string;
  text: string;
  recordedBy: string;
  recordedByName: string;
  recordedAt: any;
  editedAt?: any;
  editedByName?: string;
}

// --- Utils ---

const safeToDate = (ts: any): Date => {
  if (!ts) return new Date();
  if (ts instanceof Date) return ts;
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (ts.seconds !== undefined) return new Date(ts.seconds * 1000);
  const d = new Date(ts);
  return isNaN(d.getTime()) ? new Date() : d;
};

// --- Components ---

const Button = ({ 
  children, 
  onClick, 
  className, 
  variant = 'primary', 
  disabled = false,
  type = 'button'
}: { 
  children: React.ReactNode; 
  onClick?: () => void; 
  className?: string; 
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
}) => {
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm',
    secondary: 'bg-slate-800 text-white hover:bg-slate-900',
    outline: 'border border-slate-200 text-slate-700 hover:bg-slate-50',
    ghost: 'text-slate-600 hover:bg-slate-100',
    danger: 'bg-red-500 text-white hover:bg-red-600 shadow-sm',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'px-4 py-2 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2',
        variants[variant],
        className
      )}
    >
      {children}
    </button>
  );
};

const Card = ({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void; key?: React.Key }) => (
  <div 
    className={cn('bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden', className)}
    onClick={onClick}
  >
    {children}
  </div>
);

const Badge = ({ children, variant = 'default', ...props }: { children: React.ReactNode; variant?: 'default' | 'danger' | 'success' | 'warning'; key?: React.Key } & React.HTMLAttributes<HTMLSpanElement>) => {
  const variants = {
    default: 'bg-slate-100 text-slate-700',
    danger: 'bg-red-100 text-red-700',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-amber-100 text-amber-700',
  };
  return (
    <span {...props} className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider', variants[variant], props.className)}>
      {children}
    </span>
  );
};

// --- Error Handling ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends (Component as any) {
  public state: ErrorBoundaryState = { hasError: false, error: null };

  constructor(props: ErrorBoundaryProps) {
    super(props);
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      let message = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.error.message);
        if (parsed.error) message = parsed.error;
      } catch (e) {}

      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
          <XCircle className="w-16 h-16 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold mb-2">Application Error</h2>
          <p className="text-slate-500 mb-6 max-w-sm">{message}</p>
          <Button onClick={() => window.location.reload()}>Reload Application</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Main App ---

export default function App() {
  return (
    <ErrorBoundary>
      <SmartNurseStation />
    </ErrorBoundary>
  );
}

function SmartNurseStation() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'dashboard' | 'scanner' | 'details' | 'create' | 'edit' | 'search' | 'vitals' | 'medications' | 'administer' | 'profile' | 'add-schedule' | 'vitals-history' | 'nurse-dashboard'>('dashboard');
  const [scannedId, setScannedId] = useState<string | null>(null);
  const [currentPatient, setCurrentPatient] = useState<Patient | null>(null);
  const [medicationLogs, setMedicationLogs] = useState<MedicationLog[]>([]);
  const [scheduledMedications, setScheduledMedications] = useState<ScheduledMedication[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduledMedication | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [vitalsHistory, setVitalsHistory] = useState<any[]>([]);
  const [interactionAlert, setInteractionAlert] = useState<{ severity: 'high' | 'medium' | 'low', message: string } | null>(null);
  const [recentScans, setRecentScans] = useState<{patient: Patient, scannedAt: number}[]>(() => {
    try {
      const saved = localStorage.getItem('recentScans');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {}
    return [];
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [allPatients, setAllPatients] = useState<Patient[]>([]);
  const [totalMedsDue, setTotalMedsDue] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [patientNotes, setPatientNotes] = useState<ShiftNote[]>([]);
  const [newNoteText, setNewNoteText] = useState('');

  const todayScans = useMemo(() => {
    const today = new Date().toDateString();
    return recentScans.filter(s => new Date(s.scannedAt).toDateString() === today);
  }, [recentScans]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteText, setEditNoteText] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // Auth check
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const updatePatientStatus = async (patientId: string, newStatus: 'Stable' | 'Critical' | 'Observation') => {
    try {
      const patientRef = doc(db, 'patients', patientId);
      await updateDoc(patientRef, { status: newStatus, updatedAt: serverTimestamp() });
      setAllPatients(prev => prev.map(p => p.id === patientId ? { ...p, status: newStatus } : p));
      if (currentPatient?.id === patientId) {
        setCurrentPatient(prev => prev ? { ...prev, status: newStatus } : null);
      }
    } catch (err) {
      console.error("Error updating status:", err);
      setError("Failed to update patient status.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setView('dashboard');
    } catch (err) {
      setError("Logout failed.");
    }
  };

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const q = query(collection(db, 'patients'));
        const querySnapshot = await getDocs(q);
        const patients = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Patient));
        setAllPatients(patients);
      } catch (error) {
        console.error("Error fetching patients:", error);
      }
    };
    if (user) {
      fetchAll();
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem('recentScans', JSON.stringify(recentScans));
  }, [recentScans]);

  useEffect(() => {
    const fetchTotalMedsDue = async () => {
      if (!allPatients.length) return;
      try {
        let count = 0;
        const now = new Date();
        await Promise.all(allPatients.map(async (patient) => {
          const schedQ = query(collection(db, 'patients', patient.id, 'scheduledMedications'));
          const schedSnapshot = await getDocs(schedQ);
          schedSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.nextDue) {
              const nextDueDate = safeToDate(data.nextDue);
              if (nextDueDate < now) {
                count++;
              }
            }
          });
        }));
        setTotalMedsDue(count);
      } catch (error) {
        console.error("Error fetching total meds due:", error);
      }
    };
    
    if (view === 'nurse-dashboard') {
      fetchTotalMedsDue();
    }
  }, [allPatients, view]);

  useEffect(() => {
    const fetchMedications = async () => {
      if (!currentPatient) return;
      try {
        const logsQ = query(collection(db, 'patients', currentPatient.id, 'medicationLogs'), orderBy('administeredAt', 'desc'), limit(20));
        const logsSnapshot = await getDocs(logsQ);
        setMedicationLogs(logsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MedicationLog)));

        const schedQ = query(collection(db, 'patients', currentPatient.id, 'scheduledMedications'), orderBy('nextDue', 'asc'));
        const schedSnapshot = await getDocs(schedQ);
        setScheduledMedications(schedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ScheduledMedication)));
      } catch (error) {
        console.error("Error fetching medications:", error);
      }
    };
    
    const fetchNotes = async () => {
      if (!currentPatient) return;
      try {
        const q = query(collection(db, 'patients', currentPatient.id, 'shiftNotes'), orderBy('recordedAt', 'desc'));
        const snapshot = await getDocs(q);
        setPatientNotes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ShiftNote)));
      } catch (error) {
        console.error("Error fetching notes:", error);
      }
    };

    if (currentPatient && (view === 'medications' || view === 'details')) {
      fetchMedications();
      fetchNotes();
    }
  }, [currentPatient, view]);

  useEffect(() => {
    const fetchVitalsHistory = async () => {
      if (!currentPatient) return;
      try {
        const q = query(collection(db, 'patients', currentPatient.id, 'vitals'), orderBy('recordedAt', 'desc'), limit(50));
        const snapshot = await getDocs(q);
        setVitalsHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error("Error fetching vitals history:", error);
      }
    };
    if (currentPatient && view === 'vitals-history') {
      fetchVitalsHistory();
    }
  }, [currentPatient, view]);

  const handleAdministerMedication = async (medData: any) => {
    if (!currentPatient || !user) return;
    setLoading(true);
    const path = `patients/${currentPatient.id}/medicationLogs`;
    try {
      const logRef = doc(collection(db, 'patients', currentPatient.id, 'medicationLogs'));
      
      // Clean up undefined fields
      const cleanedMedData = Object.fromEntries(
        Object.entries(medData).filter(([_, v]) => v !== undefined)
      );

      // Use provided time or current time
      let administeredAt = serverTimestamp();
      if (medData.administeredAt) {
        const date = new Date(medData.administeredAt);
        if (!isNaN(date.getTime())) {
          administeredAt = Timestamp.fromDate(date);
        }
      }

      const newLog = {
        ...cleanedMedData,
        administeredAt,
        administeredBy: user.uid,
        administeredByName: user.displayName || user.email || 'Unknown Nurse',
      };
      await setDoc(logRef, newLog);

      // Add to current medications if not already there
      if (!currentPatient.currentMedications.includes(medData.medicationName)) {
        const patientRef = doc(db, 'patients', currentPatient.id);
        await updateDoc(patientRef, {
          currentMedications: arrayUnion(medData.medicationName)
        });
        setCurrentPatient({
          ...currentPatient,
          currentMedications: [...currentPatient.currentMedications, medData.medicationName]
        });
      }
      
      // If it was a scheduled med, update the nextDue time based on frequency
      if (medData.scheduledId) {
        const scheduledMed = scheduledMedications.find(m => m.id === medData.scheduledId);
        if (scheduledMed) {
          const schedRef = doc(db, 'patients', currentPatient.id, 'scheduledMedications', medData.scheduledId);
          
          // Calculate next due based on administration time
          const nextDue = medData.administeredAt ? new Date(medData.administeredAt) : new Date();
          
          // Calculate next due based on frequency
          const freq = scheduledMed.frequency.toLowerCase();
          if (freq.includes('4 hours')) nextDue.setHours(nextDue.getHours() + 4);
          else if (freq.includes('6 hours')) nextDue.setHours(nextDue.getHours() + 6);
          else if (freq.includes('8 hours')) nextDue.setHours(nextDue.getHours() + 8);
          else if (freq.includes('12 hours') || freq.includes('twice daily')) nextDue.setHours(nextDue.getHours() + 12);
          else if (freq.includes('once daily')) nextDue.setHours(nextDue.getHours() + 24);
          else if (freq.includes('three times daily')) nextDue.setHours(nextDue.getHours() + 8);
          else nextDue.setHours(nextDue.getHours() + 8); // Default fallback

          await updateDoc(schedRef, { nextDue, updatedAt: serverTimestamp() });
          
          // Update local state
          setScheduledMedications(prev => prev.map(m => 
            m.id === medData.scheduledId ? { ...m, nextDue } : m
          ));
        }
      }

      setView('medications');
      setSelectedSchedule(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    } finally {
      setLoading(false);
    }
  };
  const handleAddSchedule = async (schedData: any) => {
    if (!currentPatient) return;
    setLoading(true);
    const path = `patients/${currentPatient.id}/scheduledMedications`;
    try {
      // Clean up undefined fields
      const cleanedSchedData = Object.fromEntries(
        Object.entries(schedData).filter(([_, v]) => v !== undefined)
      );

      if (selectedSchedule) {
        const schedRef = doc(db, 'patients', currentPatient.id, 'scheduledMedications', selectedSchedule.id);
        await updateDoc(schedRef, cleanedSchedData);
      } else {
        const schedRef = doc(collection(db, 'patients', currentPatient.id, 'scheduledMedications'));
        const nextDue = new Date();
        // Default to 1 hour from now for the first dose
        nextDue.setHours(nextDue.getHours() + 1);
        
        await setDoc(schedRef, {
          ...cleanedSchedData,
          nextDue,
        });
      }

      // Add to current medications if not already there
      if (!currentPatient.currentMedications.includes(schedData.medicationName)) {
        const patientRef = doc(db, 'patients', currentPatient.id);
        await updateDoc(patientRef, {
          currentMedications: arrayUnion(schedData.medicationName)
        });
        setCurrentPatient({
          ...currentPatient,
          currentMedications: [...currentPatient.currentMedications, schedData.medicationName]
        });
      }

      setSelectedSchedule(null);
      setView('medications');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!currentPatient) return;
    
    setLoading(true);
    const path = `patients/${currentPatient.id}/scheduledMedications/${scheduleId}`;
    try {
      await deleteDoc(doc(db, 'patients', currentPatient.id, 'scheduledMedications', scheduleId));
      setScheduledMedications(prev => prev.filter(s => s.id !== scheduleId));
      setDeletingId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!currentPatient || !user || !newNoteText.trim()) return;
    setLoading(true);
    const path = `patients/${currentPatient.id}/shiftNotes`;
    try {
      const noteRef = doc(collection(db, 'patients', currentPatient.id, 'shiftNotes'));
      const newNote = {
        text: newNoteText.trim(),
        recordedBy: user.uid,
        recordedByName: user.displayName || user.email || 'Unknown Nurse',
        recordedAt: serverTimestamp(),
      };
      await setDoc(noteRef, newNote);
      setPatientNotes([{ id: noteRef.id, ...newNote, recordedAt: new Date() }, ...patientNotes]);
      setNewNoteText('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    } finally {
      setLoading(false);
    }
  };

  const handleEditNote = async (noteId: string) => {
    if (!currentPatient || !user || !editNoteText.trim()) return;
    setLoading(true);
    const path = `patients/${currentPatient.id}/shiftNotes/${noteId}`;
    try {
      const noteRef = doc(db, 'patients', currentPatient.id, 'shiftNotes', noteId);
      const editedByName = user.displayName || user.email || 'Unknown Nurse';
      await updateDoc(noteRef, {
        text: editNoteText.trim(),
        editedBy: user.uid,
        editedByName,
        editedAt: serverTimestamp(),
      });
      setPatientNotes(prev => prev.map(n => n.id === noteId ? { 
        ...n, 
        text: editNoteText.trim(), 
        editedByName,
        editedAt: new Date() 
      } : n));
      setEditingNoteId(null);
      setEditNoteText('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateVitals = async (vitalsData: any) => {
    if (!currentPatient) return;
    setLoading(true);
    const path = `patients/${currentPatient.id}`;
    try {
      const docRef = doc(db, 'patients', currentPatient.id);
      
      // Clean up undefined fields
      const cleanedVitalsData = Object.fromEntries(
        Object.entries(vitalsData).filter(([_, v]) => v !== undefined)
      );

      const updatedVitals = {
        ...cleanedVitalsData,
        recordedAt: serverTimestamp(),
      };
      await updateDoc(docRef, {
        lastVitals: updatedVitals,
        updatedAt: serverTimestamp(),
      });

      // Also save to history subcollection
      const historyRef = doc(collection(db, 'patients', currentPatient.id, 'vitals'));
      await setDoc(historyRef, updatedVitals);
      
      // Update local state
      const updatedPatient = {
        ...currentPatient,
        lastVitals: updatedVitals,
      };
      setCurrentPatient(updatedPatient);
      setAllPatients(prev => prev.map(p => p.id === updatedPatient.id ? updatedPatient : p));
      setRecentScans(prev => prev.map(s => s.patient.id === updatedPatient.id ? { ...s, patient: updatedPatient } : s));
      
      setView('details');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    } finally {
      setLoading(false);
    }
  };

  const startScanner = () => {
    setView('scanner');
    setIsScanning(true);
  };

  const stopScanner = () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      scannerRef.current.stop().then(() => {
        scannerRef.current?.clear();
        setIsScanning(false);
      }).catch(err => console.error(err));
    } else {
      setIsScanning(false);
    }
  };

  // Scanner lifecycle
  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;

    if (view === 'scanner' && isScanning) {
      const timer = setTimeout(() => {
        const element = document.getElementById("reader");
        if (element) {
          html5QrCode = new Html5Qrcode("reader");
          scannerRef.current = html5QrCode;
          html5QrCode.start(
            { facingMode: "environment" },
            { 
              fps: 30, 
              qrbox: (viewWidth, viewHeight) => {
                const minEdge = Math.min(viewWidth, viewHeight);
                // Larger box for better recognition of small/large QRs
                const qrboxSize = Math.max(220, Math.floor(minEdge * 0.8));
                return { width: qrboxSize, height: qrboxSize };
              },
              aspectRatio: 1.0,
              // @ts-ignore - experimental feature in some versions
              useBarCodeDetectorIfSupported: true,
            },
            (decodedText) => {
              setIsScanning(false);
              handlePatientLookup(decodedText);
            },
            () => {}
          ).catch(err => {
            console.error("Scanner start error:", err);
            setError("Camera access denied or error.");
            setIsScanning(false);
          });
        }
      }, 500);

      return () => {
        clearTimeout(timer);
        if (html5QrCode && html5QrCode.isScanning) {
          html5QrCode.stop().then(() => {
            html5QrCode?.clear();
          }).catch(err => console.error("Scanner stop error:", err));
        }
      };
    }
  }, [view, isScanning]);

  const handlePatientLookup = async (rawId: string) => {
    const id = rawId.replace(/\//g, '_');
    setLoading(true);
    setScannedId(id);
    const path = `patients/${id}`;
    try {
      const docRef = doc(db, 'patients', id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const patientData = docSnap.data() as Patient;
        setCurrentPatient(patientData);
        
        // Update recent scans
        setRecentScans(prev => {
          const filtered = prev.filter(s => s.patient.id !== patientData.id);
          return [{ patient: patientData, scannedAt: Date.now() }, ...filtered].slice(0, 4);
        });
        
        setView('details');
      } else {
        setView('create');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, path);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllPatients = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'patients'));
      const patients = querySnapshot.docs.map(doc => doc.data() as Patient);
      setAllPatients(patients);
    } catch (err) {
      console.error("Error fetching patients:", err);
    }
  };

  useEffect(() => {
    if (view === 'search') {
      fetchAllPatients();
    }
  }, [view]);

  const handleCreatePatient = async (patientData: Partial<Patient>) => {
    if (!scannedId) return;
    setLoading(true);
    const path = `patients/${scannedId}`;
    try {
      if (view === 'edit' && currentPatient) {
        const updatedData = {
          fullName: patientData.fullName || '',
          dateOfBirth: patientData.dateOfBirth || '',
          gender: patientData.gender || 'Other',
          bloodType: patientData.bloodType || 'O+',
          allergies: patientData.allergies || [],
          chronicConditions: patientData.chronicConditions || [],
          currentMedications: patientData.currentMedications || [],
          room: patientData.room || '',
          emergencyContact: patientData.emergencyContact || { name: '', relationship: '', phone: '' },
          updatedAt: serverTimestamp(),
        };
        await updateDoc(doc(db, 'patients', scannedId), updatedData);
        setCurrentPatient({ ...currentPatient, ...updatedData, updatedAt: new Date() } as Patient);
      } else {
        const newPatient: Patient = {
          id: scannedId,
          fullName: patientData.fullName || '',
          dateOfBirth: patientData.dateOfBirth || '',
          gender: patientData.gender || 'Other',
          bloodType: patientData.bloodType || 'O+',
          allergies: patientData.allergies || [],
          chronicConditions: patientData.chronicConditions || [],
          currentMedications: patientData.currentMedications || [],
          room: patientData.room || '',
          emergencyContact: patientData.emergencyContact || { name: '', relationship: '', phone: '' },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await setDoc(doc(db, 'patients', scannedId), newPatient);
        setCurrentPatient(newPatient);
      }
      setView('details');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !isScanning) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Activity className="w-8 h-8 text-blue-600 animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return <Auth onAuthSuccess={() => {}} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-slate-100 px-6 py-4 sticky top-0 z-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-100">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-bold text-slate-900 leading-none">Smart Nurse</h2>
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">Station Alpha</span>
          </div>
        </div>
        <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      <main className="p-6 max-w-lg mx-auto">
        <AnimatePresence mode="wait">
          {view === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="bg-blue-600 rounded-3xl p-8 text-white shadow-2xl shadow-blue-200 relative overflow-hidden">
                <div className="absolute top-4 right-4 text-white/10">
                  <Stethoscope className="w-32 h-32" />
                </div>
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                      <HeartPulse className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-blue-100">Nurse on Duty</span>
                  </div>
                  <h3 className="text-2xl font-bold mb-2">Ready for Rounds?</h3>
                  <p className="text-blue-100 text-sm mb-6">Scan a patient's QR code to access their HIMS record instantly.</p>
                  <Button onClick={startScanner} variant="secondary" className="bg-white text-blue-600 hover:bg-blue-50 w-full py-4 text-lg">
                    <QrCode className="w-5 h-5" />
                    Start Scanning
                  </Button>
                  <Button 
                    onClick={() => {
                      const id = prompt("Enter Patient ID manually:");
                      if (id) {
                        handlePatientLookup(id);
                      }
                    }} 
                    variant="ghost" 
                    className="text-white/80 hover:text-white hover:bg-white/10 w-full mt-2"
                  >
                    Enter ID Manually
                  </Button>
                </div>
                <div className="absolute top-0 right-0 -mr-10 -mt-10 w-40 h-40 bg-blue-500 rounded-full opacity-20" />
                <div className="absolute bottom-0 left-0 -ml-10 -mb-10 w-32 h-32 bg-blue-400 rounded-full opacity-20" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Card className="p-5 flex flex-col items-center text-center gap-3 bg-white border-none shadow-sm cursor-pointer hover:bg-slate-50 transition-all" onClick={() => setView('search')}>
                  <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                    <User className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Patients</div>
                    <div className="text-xl font-bold text-slate-900">{allPatients.length > 0 ? allPatients.length : '12'} Active</div>
                  </div>
                </Card>
                <Card className="p-5 flex flex-col items-center text-center gap-3 bg-white border-none shadow-sm">
                  <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center text-green-600">
                    <History className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Recent Scans</div>
                    <div className="text-xl font-bold text-slate-900">{todayScans.length} Scanned</div>
                  </div>
                </Card>
              </div>

              {todayScans.length > 0 && (
                <div className="space-y-4">
                  <h4 className="font-bold text-slate-400 text-xs uppercase tracking-widest px-1">Recently Scanned</h4>
                  <div className="space-y-3">
                    {todayScans.map(({ patient }) => (
                      <Card 
                        key={patient.id} 
                        onClick={() => { setCurrentPatient(patient); setView('details'); }}
                        className="p-4 flex items-center justify-between bg-white border-none shadow-sm cursor-pointer hover:ring-2 hover:ring-blue-100 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600">
                            <User className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="font-bold text-sm text-slate-900">{patient.fullName}</div>
                            <div className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">
                              {patient.id} {patient.room && `• Room ${patient.room}`}
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300" />
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {view === 'scanner' && (
            <motion.div
              key="scanner"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black z-50 flex flex-col"
            >
              <div className="p-6 flex items-center justify-between text-white">
                <button onClick={() => { stopScanner(); setView('dashboard'); }} className="p-2">
                  <ChevronLeft className="w-8 h-8" />
                </button>
                <span className="font-bold">Scan Patient QR</span>
                <div className="w-8" />
              </div>
              <div className="flex-1 flex items-center justify-center relative">
                <div id="reader" className="w-full max-w-sm overflow-hidden rounded-3xl border-2 border-blue-500/50 min-h-[300px] bg-slate-900/50" />
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-64 h-64 border-2 border-white/20 rounded-3xl" />
                </div>
              </div>
              <div className="p-10 text-center text-white/60 text-sm flex flex-col gap-4">
                <p>Align the patient's QR code within the frame to scan.</p>
                <div className="flex justify-center">
                  <Button 
                    variant="outline" 
                    className="border-white/20 text-white hover:bg-white/10"
                    onClick={() => {
                      const id = prompt("Enter Patient ID manually:");
                      if (id) {
                        stopScanner();
                        handlePatientLookup(id);
                      }
                    }}
                  >
                    Enter ID Manually
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'search' && (
            <motion.div
              key="search"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6 pb-12"
            >
              <div className="flex items-center gap-4 mb-2">
                <Button onClick={() => setView('dashboard')} variant="ghost" className="p-2 rounded-full bg-white shadow-sm">
                  <ChevronLeft className="w-6 h-6" />
                </Button>
                <h3 className="text-xl font-bold">Patient Directory</h3>
              </div>

              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                <input 
                  type="text" 
                  placeholder="Search by name or ID..."
                  className="w-full bg-white border-none rounded-2xl pl-12 pr-4 py-4 text-sm shadow-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {searchQuery === '' && todayScans.length > 0 && (
                <div className="space-y-4">
                  <h4 className="font-bold text-slate-400 text-[10px] uppercase tracking-widest px-1">Recently Scanned</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {todayScans.map(({ patient }) => (
                      <Card 
                        key={patient.id} 
                        onClick={() => { setCurrentPatient(patient); setView('details'); }}
                        className="p-4 bg-white border-none shadow-sm cursor-pointer hover:ring-2 hover:ring-blue-100 transition-all flex flex-col items-center text-center gap-2"
                      >
                        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                          <User className="w-5 h-5" />
                        </div>
                        <div className="font-bold text-xs text-slate-900 truncate w-full">{patient.fullName.split(' ')[0]}</div>
                        <div className="text-[8px] text-slate-400 font-mono">
                          {patient.id} {patient.room && `• Rm ${patient.room}`}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <h4 className="font-bold text-slate-400 text-[10px] uppercase tracking-widest px-1">
                  {searchQuery ? 'Search Results' : 'All Patients'}
                </h4>
                <div className="space-y-3">
                  {allPatients
                    .filter(p => 
                      p.fullName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                      p.id.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .map(patient => (
                      <Card 
                        key={patient.id} 
                        onClick={() => { setCurrentPatient(patient); setView('details'); }}
                        className="p-4 flex items-center justify-between bg-white border-none shadow-sm cursor-pointer hover:ring-2 hover:ring-blue-100 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-600">
                            <User className="w-6 h-6" />
                          </div>
                          <div>
                            <div className="font-bold text-slate-900">{patient.fullName}</div>
                            <div className="text-xs text-slate-400 font-mono uppercase font-bold tracking-tighter">{patient.id}</div>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-300" />
                      </Card>
                    ))}
                  {allPatients.length === 0 && !loading && (
                    <div className="text-center py-12 bg-white rounded-3xl shadow-sm">
                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Search className="w-8 h-8 text-slate-300" />
                      </div>
                      <p className="text-slate-500 font-medium">No patients found</p>
                      <p className="text-xs text-slate-400 mt-1">Try a different search term</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {view === 'nurse-dashboard' && (
            <motion.div
              key="nurse-dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6 pb-12"
            >
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xl font-bold">Shift Overview</h3>
                <Badge variant="success">On Duty</Badge>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Card className="p-3 flex flex-col items-center gap-1 bg-white border-none shadow-sm">
                  <div className="text-blue-600 font-bold text-lg">{allPatients.length}</div>
                  <div className="text-[8px] text-slate-400 uppercase font-bold tracking-widest">Patients</div>
                </Card>
                <Card className="p-3 flex flex-col items-center gap-1 bg-white border-none shadow-sm">
                  <div className="text-orange-600 font-bold text-lg">
                    {totalMedsDue}
                  </div>
                  <div className="text-[8px] text-slate-400 uppercase font-bold tracking-widest">Meds Due</div>
                </Card>
                <Card className="p-3 flex flex-col items-center gap-1 bg-white border-none shadow-sm">
                  <div className="text-green-600 font-bold text-lg">
                    {allPatients.filter(p => {
                      if (!p.lastVitals?.recordedAt) return false;
                      const recordedAt = p.lastVitals.recordedAt.toDate?.() || new Date(p.lastVitals.recordedAt);
                      const now = new Date();
                      return now.getTime() - recordedAt.getTime() < 24 * 60 * 60 * 1000;
                    }).length}
                  </div>
                  <div className="text-[8px] text-slate-400 uppercase font-bold tracking-widest">Vitals Done</div>
                </Card>
              </div>

              <div className="space-y-4">
                <h4 className="font-bold text-slate-400 text-[10px] uppercase tracking-widest px-1">Patient Status</h4>
                <div className="space-y-3">
                  {allPatients.length > 0 ? (
                    allPatients.slice(0, 5).map(patient => (
                      <Card 
                        key={patient.id} 
                        className="p-4 bg-white border-none shadow-sm flex flex-col gap-3 cursor-pointer hover:ring-2 hover:ring-blue-100 transition-all"
                        onClick={() => { setCurrentPatient(patient); setView('details'); }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                              <User className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="font-bold text-sm text-slate-900">{patient.fullName}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <div className={cn(
                                  "w-1.5 h-1.5 rounded-full",
                                  patient.status === 'Critical' ? 'bg-red-500' : 
                                  patient.status === 'Observation' ? 'bg-amber-500' : 'bg-green-500'
                                )} />
                                <span className="text-[10px] text-slate-400 font-medium">
                                  {patient.status || 'Stable'} {patient.room && `• Rm ${patient.room}`}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] font-bold text-slate-900">{patient.lastVitals?.heartRate || '--'} BPM</div>
                            <div className="text-[8px] text-slate-400 uppercase font-bold tracking-widest">Last HR</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pt-2 border-t border-slate-50">
                          <span className="text-[8px] font-bold text-slate-400 uppercase">Update Status:</span>
                          <div className="flex gap-1">
                            {(['Stable', 'Observation', 'Critical'] as const).map(s => (
                              <button
                                key={s}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updatePatientStatus(patient.id, s);
                                }}
                                className={cn(
                                  "px-2 py-1 rounded-lg text-[8px] font-bold transition-all",
                                  (patient.status === s || (!patient.status && s === 'Stable'))
                                    ? s === 'Stable' ? 'bg-green-600 text-white' : 
                                      s === 'Observation' ? 'bg-amber-500 text-white' : 'bg-red-600 text-white'
                                    : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                )}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        </div>
                      </Card>
                    ))
                  ) : (
                    <div className="text-center py-8 text-slate-400 text-sm">No patients found</div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {view === 'details' && currentPatient && (
            <motion.div
              key="details"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6 pb-12"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-4">
                  <Button onClick={() => setView('dashboard')} variant="ghost" className="p-2 rounded-full bg-white shadow-sm">
                    <ChevronLeft className="w-6 h-6" />
                  </Button>
                  <h3 className="text-xl font-bold">Patient Profile</h3>
                </div>
                <Button onClick={() => setView('edit')} variant="outline" className="rounded-full px-6 border-blue-100 text-blue-600 hover:bg-blue-50">
                  Edit Record
                </Button>
              </div>

              {/* Patient Header Card */}
              <Card className="p-6 bg-white border-none shadow-sm overflow-hidden relative">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full -mr-16 -mt-16 opacity-50" />
                <div className="relative z-10">
                  <div className="flex items-center gap-5 mb-6">
                    <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-blue-100">
                      <User className="w-10 h-10" />
                    </div>
                    <div>
                      <h4 className="text-2xl font-bold text-slate-900 leading-tight">{currentPatient.fullName}</h4>
                      <p className="text-slate-500 font-medium">
                        {currentPatient.gender} • {format(new Date(currentPatient.dateOfBirth), 'MMM d, yyyy')}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Badge variant="success" className="bg-green-50 text-green-600 border-none px-3 py-1">Active Patient</Badge>
                        {currentPatient.room && (
                          <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 px-3 py-1">
                            Room {currentPatient.room}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 py-5 border-y border-slate-50">
                    <div className="text-center">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Blood</span>
                      <div className="text-red-600 font-bold flex items-center justify-center gap-1">
                        <Droplets className="w-3 h-3" />
                        {currentPatient.bloodType}
                      </div>
                    </div>
                    <div className="text-center border-x border-slate-50">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Age</span>
                      <div className="text-slate-900 font-bold">
                        {Math.floor((new Date().getTime() - new Date(currentPatient.dateOfBirth).getTime()) / (1000 * 60 * 60 * 24 * 365.25))}y
                      </div>
                    </div>
                    <div className="text-center">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">ID</span>
                      <div className="text-slate-900 font-mono text-[10px] font-bold">{currentPatient.id}</div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Alerts Section */}
              {(currentPatient.allergies.length > 0 || currentPatient.chronicConditions.length > 0) && (
                <div className="space-y-3">
                  <h4 className="font-bold text-slate-400 text-[10px] uppercase tracking-widest px-1">Medical Alerts</h4>
                  <div className="flex flex-wrap gap-2">
                    {currentPatient.allergies.map((allergy, i) => (
                      <div key={i} className="bg-red-50 text-red-600 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border border-red-100">
                        <ShieldAlert className="w-3 h-3" />
                        Allergy: {allergy}
                      </div>
                    ))}
                    {currentPatient.chronicConditions.map((condition, i) => (
                      <div key={i} className="bg-amber-50 text-amber-700 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border border-amber-100">
                        <Activity className="w-3 h-3" />
                        {condition}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Vitals Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h4 className="font-bold text-slate-400 text-[10px] uppercase tracking-widest">Latest Vitals</h4>
                  <div className="flex gap-3">
                    <span 
                      onClick={() => setView('vitals-history')}
                      className="text-[10px] text-blue-600 font-bold uppercase tracking-widest cursor-pointer"
                    >
                      History
                    </span>
                    <span 
                      onClick={() => setView('vitals')}
                      className="text-[10px] text-green-600 font-bold uppercase tracking-widest cursor-pointer"
                    >
                      Update
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Card className="p-4 bg-white border-none shadow-sm flex items-center gap-4">
                    <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center text-red-600">
                      <Heart className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">BPM</div>
                      <div className="text-lg font-bold text-slate-900">{currentPatient.lastVitals?.heartRate || '--'}</div>
                    </div>
                  </Card>
                  <Card className="p-4 bg-white border-none shadow-sm flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                      <Activity className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">BP</div>
                      <div className="text-lg font-bold text-slate-900">{currentPatient.lastVitals?.bloodPressure || '--'}</div>
                    </div>
                  </Card>
                  <Card className="p-4 bg-white border-none shadow-sm flex items-center gap-4">
                    <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600">
                      <Thermometer className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Temp</div>
                      <div className="text-lg font-bold text-slate-900">{currentPatient.lastVitals?.temperature || '--'}°C</div>
                    </div>
                  </Card>
                  <Card className="p-4 bg-white border-none shadow-sm flex items-center gap-4">
                    <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center text-green-600">
                      <Droplets className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">SpO2</div>
                      <div className="text-lg font-bold text-slate-900">{currentPatient.lastVitals?.spo2 || '--'}%</div>
                    </div>
                  </Card>
                </div>
              </div>

              {/* Emergency Contact */}
              <div className="space-y-3">
                <h4 className="font-bold text-slate-400 text-[10px] uppercase tracking-widest px-1">Emergency Contact</h4>
                <Card className="p-5 bg-white border-none shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400">
                        <Phone className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-900">{currentPatient.emergencyContact.name}</div>
                        <div className="text-xs text-slate-500 font-medium">{currentPatient.emergencyContact.relationship}</div>
                      </div>
                    </div>
                    <Button variant="outline" className="rounded-full w-10 h-10 p-0 border-slate-100">
                      <Phone className="w-4 h-4 text-blue-600" />
                    </Button>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-50 text-sm font-bold text-slate-900">
                    {currentPatient.emergencyContact.phone}
                  </div>
                </Card>
              </div>

              {/* Medications */}
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h4 className="font-bold text-slate-400 text-[10px] uppercase tracking-widest">Medications</h4>
                  <span 
                    onClick={() => setView('medications')}
                    className="text-[10px] text-blue-600 font-bold uppercase tracking-widest cursor-pointer"
                  >
                    View Schedule
                  </span>
                </div>
                {currentPatient.currentMedications.length > 0 ? (
                  <Card className="p-5 bg-white border-none shadow-sm space-y-3">
                    {currentPatient.currentMedications.slice(0, 3).map((med, i) => {
                      const schedule = scheduledMedications.find(s => s.medicationName === med);
                      const isOverdue = schedule && safeToDate(schedule.nextDue) < new Date();
                      const hasBeenTaken = medicationLogs.some(l => l.medicationName === med);
                      const isRed = isOverdue || !hasBeenTaken;
                      
                      return (
                        <div key={i} className="flex items-center gap-3 text-sm">
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            isRed ? "bg-red-500" : "bg-blue-400"
                          )} />
                          <span className="font-medium text-slate-700">{med}</span>
                        </div>
                      );
                    })}
                    {currentPatient.currentMedications.length > 3 && (
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pt-2 border-t border-slate-50">
                        + {currentPatient.currentMedications.length - 3} more medications
                      </div>
                    )}
                  </Card>
                ) : (
                  <Card className="p-5 bg-white border-none shadow-sm text-center py-8">
                    <p className="text-xs text-slate-400">No active medications recorded</p>
                  </Card>
                )}
              </div>

              {/* Shift Notes */}
              <div className="space-y-4">
                <h4 className="font-bold text-slate-400 text-[10px] uppercase tracking-widest px-1">Shift Notes</h4>
                <Card className="p-5 bg-white border-none shadow-sm space-y-4">
                  <div className="space-y-3">
                    {patientNotes.length > 0 ? (
                      patientNotes.map(note => (
                        <div key={note.id} className="p-3 bg-slate-50 rounded-xl space-y-2 relative group">
                          {editingNoteId === note.id ? (
                            <div className="space-y-2">
                              <textarea
                                className="w-full text-sm text-slate-700 bg-white rounded-lg p-2 border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none resize-none min-h-[60px]"
                                value={editNoteText}
                                onChange={(e) => setEditNoteText(e.target.value)}
                              />
                              <div className="flex justify-end gap-2">
                                <Button variant="ghost" onClick={() => setEditingNoteId(null)} className="text-xs py-1 px-3 h-auto">Cancel</Button>
                                <Button onClick={() => handleEditNote(note.id)} className="text-xs py-1 px-3 h-auto">Save</Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="text-sm text-slate-700 whitespace-pre-wrap">{note.text}</p>
                              <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
                                <div className="flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  {note.editedAt ? `Edited by ${note.editedByName}` : `Added by ${note.recordedByName}`}
                                  <span className="mx-1">•</span>
                                  {format(safeToDate(note.editedAt || note.recordedAt), 'MMM d, HH:mm')}
                                </div>
                                {user?.uid === note.recordedBy && (
                                  <button 
                                    onClick={() => {
                                      setEditingNoteId(note.id);
                                      setEditNoteText(note.text);
                                    }}
                                    className="text-blue-600 hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    Edit
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400 text-center py-4">No shift notes recorded.</p>
                    )}
                  </div>
                  
                  <div className="pt-4 border-t border-slate-100 space-y-3">
                    <textarea 
                      className="w-full text-sm text-slate-700 bg-slate-50 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none resize-none min-h-[80px] border-none"
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      placeholder="Add a new shift note..."
                    />
                    <Button 
                      onClick={handleAddNote}
                      disabled={!newNoteText.trim() || loading}
                      className="w-full py-3 rounded-xl"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Note
                    </Button>
                  </div>
                </Card>
              </div>
            </motion.div>
          )}

          {view === 'medications' && currentPatient && (
            <motion.div
              key="medications"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6 pb-12"
            >
              <div className="flex items-center gap-4 mb-4">
                <Button onClick={() => setView('details')} variant="ghost" className="p-2 rounded-full bg-white shadow-sm">
                  <ChevronLeft className="w-6 h-6" />
                </Button>
                <h3 className="text-xl font-bold">Medication Schedule</h3>
              </div>

              {/* Scheduled Medications */}
              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <h4 className="font-bold text-slate-400 text-[10px] uppercase tracking-widest">Upcoming Doses</h4>
                  <Badge variant="danger" className="bg-red-50 text-red-600 border-none">
                    {scheduledMedications.filter(m => safeToDate(m.nextDue) < new Date()).length} Overdue
                  </Badge>
                </div>
                
                {scheduledMedications.length > 0 ? (
                  <div className="space-y-3">
                    {scheduledMedications.map(med => {
                      const isOverdue = safeToDate(med.nextDue) < new Date();
                      return (
                        <Card key={med.id} className={cn("p-4 border-none shadow-sm", isOverdue ? "bg-red-50/50" : "bg-white")}>
                          <div className="flex items-start justify-between">
                            <div className="flex gap-4">
                              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", isOverdue ? "bg-red-100 text-red-600" : "bg-blue-50 text-blue-600")}>
                                <Pill className="w-5 h-5" />
                              </div>
                              <div>
                                <div className="font-bold text-slate-900">{med.medicationName}</div>
                                <div className="text-xs text-slate-500 font-medium">{med.dosage} • {med.route}</div>
                                <div className={cn("text-[10px] font-bold mt-1 flex items-center gap-1", isOverdue ? "text-red-600" : "text-slate-400")}>
                                  <Clock className="w-3 h-3" />
                                  Next due: {format(safeToDate(med.nextDue), 'HH:mm')} ({med.frequency})
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col gap-3">
                              <Button 
                                onClick={() => {
                                  setSelectedSchedule(med);
                                  setView('administer');
                                }}
                                variant={isOverdue ? 'danger' : 'primary'} 
                                className="rounded-full px-4 py-1 h-auto text-xs"
                              >
                                Give
                              </Button>
                              <div className="flex gap-2 justify-end items-center">
                                {deletingId === med.id ? (
                                  <div className="flex gap-3 items-center bg-red-50 px-2 py-1 rounded-lg">
                                    <span className="text-[9px] font-bold text-red-600 uppercase">Delete?</span>
                                    <button 
                                      onClick={() => handleDeleteSchedule(med.id)}
                                      className="text-[9px] font-bold text-red-600 uppercase hover:underline"
                                    >
                                      Yes
                                    </button>
                                    <button 
                                      onClick={() => setDeletingId(null)}
                                      className="text-[9px] font-bold text-slate-400 uppercase hover:underline"
                                    >
                                      No
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <button 
                                      onClick={() => {
                                        setSelectedSchedule(med);
                                        setView('add-schedule');
                                      }}
                                      className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button 
                                      onClick={() => setDeletingId(med.id)}
                                      className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <Card className="p-8 text-center bg-white border-none shadow-sm">
                    <p className="text-slate-400 text-sm">No scheduled medications</p>
                  </Card>
                )}
              </div>

              {/* Administration History */}
              <div className="space-y-4">
                <h4 className="font-bold text-slate-400 text-[10px] uppercase tracking-widest px-1">Recent Administrations</h4>
                <div className="space-y-3">
                  {medicationLogs.map(log => (
                    <div key={log.id} className="flex gap-4 relative pl-4">
                      <div className="absolute left-0 top-0 bottom-0 w-px bg-slate-100" />
                      <div className="absolute left-[-4px] top-2 w-2 h-2 rounded-full bg-blue-400" />
                      <div className="flex-1">
                        <div className="text-xs font-bold text-slate-400 mb-1">
                          {format(safeToDate(log.administeredAt), 'MMM d, HH:mm')}
                        </div>
                        <Card className="p-3 bg-white border-none shadow-sm">
                          <div className="font-bold text-sm text-slate-900">{log.medicationName}</div>
                          <div className="text-xs text-slate-500">{log.dosage} • {log.route}</div>
                          <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-400 font-medium">
                            <User className="w-3 h-3" />
                            Administered by {log.administeredByName}
                          </div>
                        </Card>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sticky Footer Actions */}
              <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-slate-100 z-50">
                <div className="max-w-lg mx-auto flex gap-3">
                  <Button 
                    onClick={() => setView('add-schedule')}
                    variant="outline" 
                    className="flex-1 py-3 rounded-2xl border-dashed border-2 border-slate-200 text-slate-500 hover:bg-slate-50 text-xs bg-white"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Maintenance
                  </Button>
                  <Button 
                    onClick={() => {
                      setSelectedSchedule(null);
                      setScannedId('');
                      setView('administer');
                    }}
                    variant="outline" 
                    className="flex-1 py-3 rounded-2xl border-dashed border-2 border-slate-200 text-slate-500 hover:bg-slate-50 text-xs bg-white"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Record One-Time Dose
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'add-schedule' && currentPatient && (
            <motion.div
              key="add-schedule"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-4 mb-2">
                <Button 
                  onClick={() => {
                    setSelectedSchedule(null);
                    setView('medications');
                  }} 
                  variant="ghost" 
                  className="p-2 rounded-full bg-white shadow-sm"
                >
                  <ChevronLeft className="w-6 h-6" />
                </Button>
                <h3 className="text-xl font-bold">{selectedSchedule ? 'Edit Maintenance' : 'Add Maintenance'}</h3>
              </div>

              <Card className="p-6 bg-white border-none shadow-sm">
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    handleAddSchedule({
                      medicationName: formData.get('medicationName') as string,
                      dosage: formData.get('dosage') as string,
                      route: formData.get('route') as string,
                      frequency: formData.get('frequency') as string,
                    });
                  }}
                  className="space-y-5"
                >
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-widest">Medication Name</label>
                    <input 
                      name="medicationName" 
                      type="text" 
                      required 
                      defaultValue={selectedSchedule?.medicationName || ''}
                      className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                      placeholder="e.g., Metformin" 
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-widest">Dosage</label>
                      <input 
                        name="dosage" 
                        type="text" 
                        required 
                        defaultValue={selectedSchedule?.dosage || ''}
                        className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                        placeholder="e.g., 500mg" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-widest">Route</label>
                      <select 
                        name="route" 
                        required 
                        defaultValue={selectedSchedule?.route || 'Oral'}
                        className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                      >
                        <option value="Oral">Oral</option>
                        <option value="IV">IV</option>
                        <option value="IM">IM</option>
                        <option value="Subcutaneous">Subcutaneous</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-widest">Frequency</label>
                    <select 
                      name="frequency" 
                      required 
                      defaultValue={selectedSchedule?.frequency || 'Once daily'}
                      className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                    >
                      <option value="Once daily">Once daily</option>
                      <option value="Twice daily">Twice daily</option>
                      <option value="Every 8 hours">Every 8 hours</option>
                      <option value="Every 6 hours">Every 6 hours</option>
                      <option value="Every 4 hours">Every 4 hours</option>
                      <option value="As needed">As needed</option>
                    </select>
                  </div>

                  <Button type="submit" disabled={loading} className="w-full py-4 rounded-2xl shadow-lg shadow-blue-100">
                    {loading ? (selectedSchedule ? 'Updating...' : 'Adding...') : (selectedSchedule ? 'Update Schedule' : 'Add to Schedule')}
                  </Button>
                </form>
              </Card>
            </motion.div>
          )}

          {view === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-6 pb-12"
            >
              <div className="flex items-center gap-4 mb-2">
                <Button onClick={() => setView('dashboard')} variant="ghost" className="p-2 rounded-full bg-white shadow-sm">
                  <ChevronLeft className="w-6 h-6" />
                </Button>
                <h3 className="text-xl font-bold">Nurse Profile</h3>
              </div>

              <Card className="p-8 bg-white border-none shadow-sm text-center">
                <div className="w-24 h-24 bg-blue-600 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-blue-100 mx-auto mb-6">
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="Profile" className="w-full h-full rounded-3xl object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <User className="w-12 h-12" />
                  )}
                </div>
                <h4 className="text-2xl font-bold text-slate-900">{user?.displayName || 'Nurse User'}</h4>
                <p className="text-slate-500 font-medium mb-6">{user?.email}</p>
                
                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="bg-slate-50 p-4 rounded-2xl">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Role</div>
                    <div className="text-slate-900 font-bold">Registered Nurse</div>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Shift</div>
                    <div className="text-slate-900 font-bold">Day Shift</div>
                  </div>
                </div>

                <Button onClick={handleLogout} variant="danger" className="w-full py-4 rounded-2xl flex items-center justify-center gap-2">
                  <LogOut className="w-5 h-5" />
                  Sign Out
                </Button>
              </Card>

              <div className="space-y-4">
                <h4 className="font-bold text-slate-400 text-[10px] uppercase tracking-widest px-1">System Info</h4>
                <Card className="p-5 bg-white border-none shadow-sm space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">App Version</span>
                    <span className="font-bold text-slate-900">v2.1.0</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Last Sync</span>
                    <span className="font-bold text-slate-900">{format(new Date(), 'HH:mm')}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Status</span>
                    <Badge variant="success" className="bg-green-50 text-green-600 border-none">Online</Badge>
                  </div>
                </Card>
              </div>
            </motion.div>
          )}

          {view === 'administer' && currentPatient && (
            <motion.div
              key="administer"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-4 mb-2">
                <Button onClick={() => setView('medications')} variant="ghost" className="p-2 rounded-full bg-white shadow-sm">
                  <ChevronLeft className="w-6 h-6" />
                </Button>
                <h3 className="text-xl font-bold">Record Administration</h3>
              </div>

              <Card className="p-6 bg-white border-none shadow-sm">
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    handleAdministerMedication({
                      medicationName: formData.get('medicationName') as string,
                      dosage: formData.get('dosage') as string,
                      route: formData.get('route') as string,
                      administeredAt: formData.get('administeredAt') as string,
                      scheduledId: selectedSchedule?.id,
                    });
                  }}
                  className="space-y-5"
                >
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-widest">Medication Name</label>
                    <div className="relative">
                      <Pill className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input 
                        name="medicationName" 
                        type="text"
                        required
                        defaultValue={selectedSchedule?.medicationName || scannedId || ''}
                        className="w-full bg-slate-50 border-none rounded-xl pl-11 pr-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                        placeholder="e.g., Paracetamol" 
                      />
                    </div>
                  </div>
                  
                  {interactionAlert && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className={cn(
                        "p-4 rounded-2xl flex gap-3 text-sm border",
                        interactionAlert.severity === 'high' ? "bg-red-50 border-red-100 text-red-800" :
                        interactionAlert.severity === 'medium' ? "bg-amber-50 border-amber-100 text-amber-800" :
                        "bg-blue-50 border-blue-100 text-blue-800"
                      )}
                    >
                      <AlertTriangle className="w-5 h-5 shrink-0" />
                      <div>
                        <div className="font-bold uppercase text-[10px] tracking-widest mb-1">
                          {interactionAlert.severity} Interaction Alert
                        </div>
                        <p>{interactionAlert.message}</p>
                      </div>
                    </motion.div>
                  )}
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-widest">Time Administered</label>
                      <input 
                        name="administeredAt" 
                        type="datetime-local" 
                        defaultValue={new Date().toISOString().slice(0, 16)}
                        className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-widest">Dosage</label>
                      <input 
                        name="dosage" 
                        type="text" 
                        required 
                        defaultValue={selectedSchedule?.dosage || ''}
                        className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                        placeholder="e.g., 500mg" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-widest">Route</label>
                      <select 
                        name="route" 
                        required 
                        defaultValue={selectedSchedule?.route || 'Oral'}
                        className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                      >
                        <option value="Oral">Oral</option>
                        <option value="IV">IV</option>
                        <option value="IM">IM</option>
                        <option value="Subcutaneous">Subcutaneous</option>
                        <option value="Topical">Topical</option>
                        <option value="Inhalation">Inhalation</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-4">
                    <Button 
                      type="submit" 
                      disabled={loading || (interactionAlert?.severity === 'high')} 
                      className={cn(
                        "w-full py-4 rounded-2xl shadow-lg",
                        interactionAlert?.severity === 'high' ? "bg-slate-300 cursor-not-allowed" : "shadow-blue-100"
                      )}
                    >
                      {loading ? 'Recording...' : 'Record Administration'}
                    </Button>
                    {interactionAlert?.severity === 'high' && (
                      <p className="text-[10px] text-red-500 text-center mt-2 font-bold uppercase tracking-widest">
                        High severity interaction detected. Consult doctor.
                      </p>
                    )}
                  </div>
                </form>
              </Card>
            </motion.div>
          )}

          {view === 'vitals-history' && currentPatient && (
            <motion.div
              key="vitals-history"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6 pb-12"
            >
              <div className="flex items-center gap-4 mb-2">
                <Button onClick={() => setView('details')} variant="ghost" className="p-2 rounded-full bg-white shadow-sm">
                  <ChevronLeft className="w-6 h-6" />
                </Button>
                <h3 className="text-xl font-bold">Vitals History</h3>
              </div>

              <div className="space-y-4">
                {vitalsHistory.length > 0 ? (
                  vitalsHistory.map((v, i) => (
                    <Card key={v.id} className="p-5 bg-white border-none shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                          {v.recordedAt ? format(safeToDate(v.recordedAt), 'MMM d, yyyy • HH:mm') : 'Just now'}
                        </div>
                        <Badge variant="outline" className="text-[10px] border-slate-100">Record #{vitalsHistory.length - i}</Badge>
                      </div>
                      <div className="grid grid-cols-4 gap-4">
                        <div className="text-center">
                          <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">HR</div>
                          <div className="text-sm font-bold text-red-600">{v.heartRate}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">BP</div>
                          <div className="text-sm font-bold text-blue-600">{v.bloodPressure}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Temp</div>
                          <div className="text-sm font-bold text-orange-600">{v.temperature}°C</div>
                        </div>
                        <div className="text-center">
                          <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">SpO2</div>
                          <div className="text-sm font-bold text-green-600">{v.spo2}%</div>
                        </div>
                      </div>
                    </Card>
                  ))
                ) : (
                  <Card className="p-8 text-center bg-white border-none shadow-sm">
                    <p className="text-slate-400 text-sm">No vitals history recorded</p>
                  </Card>
                )}
              </div>
            </motion.div>
          )}

          {view === 'vitals' && currentPatient && (
            <motion.div
              key="vitals"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-4 mb-2">
                <Button onClick={() => setView('details')} variant="ghost" className="p-2 rounded-full bg-white shadow-sm">
                  <ChevronLeft className="w-6 h-6" />
                </Button>
                <h3 className="text-xl font-bold">Update Vitals</h3>
              </div>

              <Card className="p-6 bg-white border-none shadow-sm">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                    <User className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">{currentPatient.fullName}</div>
                    <div className="text-xs text-slate-400 font-mono uppercase font-bold tracking-tighter">{currentPatient.id}</div>
                  </div>
                </div>

                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    handleUpdateVitals({
                      heartRate: Number(formData.get('heartRate')),
                      bloodPressure: formData.get('bloodPressure') as string,
                      temperature: Number(formData.get('temperature')),
                      spo2: Number(formData.get('spo2')),
                    });
                  }}
                  className="space-y-5"
                >
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-widest">Heart Rate (BPM)</label>
                      <div className="relative">
                        <Heart className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-red-400" />
                        <input 
                          name="heartRate" 
                          type="number" 
                          required 
                          defaultValue={currentPatient.lastVitals?.heartRate}
                          className="w-full bg-slate-50 border-none rounded-xl pl-11 pr-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                          placeholder="72" 
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-widest">Blood Pressure</label>
                      <div className="relative">
                        <Activity className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400" />
                        <input 
                          name="bloodPressure" 
                          type="text" 
                          required 
                          defaultValue={currentPatient.lastVitals?.bloodPressure}
                          className="w-full bg-slate-50 border-none rounded-xl pl-11 pr-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                          placeholder="120/80" 
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-widest">Temp (°C)</label>
                      <div className="relative">
                        <Thermometer className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-400" />
                        <input 
                          name="temperature" 
                          type="number" 
                          step="0.1" 
                          required 
                          defaultValue={currentPatient.lastVitals?.temperature}
                          className="w-full bg-slate-50 border-none rounded-xl pl-11 pr-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                          placeholder="36.5" 
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-widest">SpO2 (%)</label>
                      <div className="relative">
                        <Droplets className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-green-400" />
                        <input 
                          name="spo2" 
                          type="number" 
                          required 
                          defaultValue={currentPatient.lastVitals?.spo2}
                          className="w-full bg-slate-50 border-none rounded-xl pl-11 pr-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                          placeholder="98" 
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-4">
                    <Button type="submit" disabled={loading} className="w-full py-4 rounded-2xl shadow-lg shadow-blue-100">
                      {loading ? 'Saving...' : 'Save Vitals'}
                    </Button>
                  </div>
                </form>
              </Card>

              <div className="bg-blue-50 rounded-2xl p-4 flex gap-3 text-blue-800 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <p>Recording vitals will update the patient's primary record and log the current timestamp: <strong>{format(new Date(), 'MMM d, yyyy HH:mm')}</strong></p>
              </div>
            </motion.div>
          )}

          {(view === 'create' || view === 'edit') && (
            <motion.div
              key={view}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-4 mb-2">
                <Button onClick={() => setView(view === 'edit' ? 'details' : 'dashboard')} variant="ghost" className="p-2 rounded-full">
                  <ChevronLeft className="w-6 h-6" />
                </Button>
                <h3 className="text-xl font-bold">{view === 'edit' ? 'Edit Patient Record' : 'New Patient Record'}</h3>
              </div>

              {view === 'create' && (
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3 text-amber-800 text-sm">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p>Patient ID <strong>{scannedId}</strong> not found. Please create a new record for this QR code.</p>
                </div>
              )}

              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  handleCreatePatient({
                    fullName: formData.get('fullName') as string,
                    dateOfBirth: formData.get('dob') as string,
                    gender: formData.get('gender') as any,
                    bloodType: formData.get('bloodType') as string,
                    allergies: (formData.get('allergies') as string).split(',').filter(s => s.trim()),
                    chronicConditions: (formData.get('chronic') as string).split(',').filter(s => s.trim()),
                    currentMedications: (formData.get('meds') as string).split(',').filter(s => s.trim()),
                    room: formData.get('room') as string,
                    emergencyContact: {
                      name: formData.get('ecName') as string,
                      relationship: formData.get('ecRel') as string,
                      phone: formData.get('ecPhone') as string,
                    }
                  });
                }}
                className="space-y-6"
              >
                <Card className="p-6 space-y-4">
                  <h5 className="font-bold text-slate-400 text-[10px] uppercase tracking-widest">Demographics</h5>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Full Name</label>
                      <input name="fullName" required defaultValue={currentPatient?.fullName} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="John Doe" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Date of Birth</label>
                        <input name="dob" type="date" required defaultValue={currentPatient?.dateOfBirth} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Gender</label>
                        <select name="gender" defaultValue={currentPatient?.gender} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                          <option>Male</option>
                          <option>Female</option>
                          <option>Other</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Blood Type</label>
                      <select name="bloodType" defaultValue={currentPatient?.bloodType} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                        {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Room / Location</label>
                      <input name="room" defaultValue={currentPatient?.room} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g. 101A" />
                    </div>
                  </div>
                </Card>

                <Card className="p-6 space-y-4">
                  <h5 className="font-bold text-slate-400 text-[10px] uppercase tracking-widest">Medical History</h5>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Allergies (comma separated)</label>
                      <input name="allergies" defaultValue={currentPatient?.allergies.join(', ')} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Peanuts, Penicillin" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Chronic Conditions</label>
                      <input name="chronic" defaultValue={currentPatient?.chronicConditions.join(', ')} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Diabetes, Hypertension" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Current Medications</label>
                      <input name="meds" defaultValue={currentPatient?.currentMedications.join(', ')} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Metformin 500mg" />
                    </div>
                  </div>
                </Card>

                <Card className="p-6 space-y-4">
                  <h5 className="font-bold text-slate-400 text-[10px] uppercase tracking-widest">Emergency Contact</h5>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Contact Name</label>
                      <input name="ecName" required defaultValue={currentPatient?.emergencyContact.name} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Relationship</label>
                        <input name="ecRel" required defaultValue={currentPatient?.emergencyContact.relationship} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Phone</label>
                        <input name="ecPhone" type="tel" required defaultValue={currentPatient?.emergencyContact.phone} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                      </div>
                    </div>
                  </div>
                </Card>

                <div className="flex gap-3">
                  <Button onClick={() => setView(view === 'edit' ? 'details' : 'dashboard')} variant="outline" className="flex-1 py-4">Cancel</Button>
                  <Button type="submit" className="flex-[2] py-4">{view === 'edit' ? 'Update Record' : 'Create Record'}</Button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-6 right-6 z-50"
          >
            <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-400" />
                <span className="text-sm font-medium">{error}</span>
              </div>
              <button onClick={() => setError(null)} className="text-xs font-bold text-slate-400 uppercase">Dismiss</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Nav (Mobile) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 px-6 py-3 flex justify-around items-center z-50">
        <button onClick={() => setView('dashboard')} className={cn('p-2 transition-colors', view === 'dashboard' ? 'text-blue-600' : 'text-slate-300')}>
          <Activity className="w-6 h-6" />
        </button>
        <button onClick={() => setView('nurse-dashboard')} className={cn('p-2 transition-colors', view === 'nurse-dashboard' ? 'text-blue-600' : 'text-slate-300')}>
          <Stethoscope className="w-6 h-6" />
        </button>
        <button onClick={startScanner} className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200 -mt-10 border-4 border-slate-50 active:scale-90 transition-transform">
          <QrCode className="w-6 h-6" />
        </button>
        <button onClick={() => setView('search')} className={cn('p-2 transition-colors', view === 'search' ? 'text-blue-600' : 'text-slate-300')}>
          <Search className="w-6 h-6" />
        </button>
        <button onClick={() => setView('profile')} className={cn('p-2 transition-colors', view === 'profile' ? 'text-blue-600' : 'text-slate-300')}>
          <User className="w-6 h-6" />
        </button>
      </nav>
    </div>
  );
}
