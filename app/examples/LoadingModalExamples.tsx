"use client";

import {
  useLoading,
  useSimpleLoading,
  useMultiLoading,
} from "@/hooks/useLoading";
import { useState } from "react";

/**
 * Example 1: Basic Loading Modal Usage
 * Simple demonstration of the LoadingModal with useLoading hook
 */
export function BasicExample() {
  const { loading, execute, LoadingModal } = useLoading({
    showLoadingModal: true,
    loadingMessage: "กำลังโหลดข้อมูล",
    loadingSubMessage: "กรุณารอสักครู่...",
  });

  const handleLoadData = async () => {
    await execute(async () => {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 3000));
      console.log("Data loaded successfully!");
    });
  };

  return (
    <div>
      <button onClick={handleLoadData} disabled={loading}>
        {loading ? "กำลังโหลด..." : "โหลดข้อมูล"}
      </button>
      {LoadingModal}
    </div>
  );
}

/**
 * Example 2: Loading Modal with Custom Messages per Operation
 * Different messages for different operations
 */
export function CustomMessageExample() {
  const { loading, execute, LoadingModal } = useLoading({
    showLoadingModal: true,
    loadingMessage: "กำลังดำเนินการ",
  });

  const handleSubmit = async () => {
    await execute(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        console.log("Form submitted!");
      },
      {
        loadingMessage: "กำลังส่งแบบฟอร์ม",
        loadingSubMessage: "อาจใช้เวลา 2-3 วินาที",
        onSuccess: () => alert("ส่งแบบฟอร์มสำเร็จ!"),
      },
    );
  };

  const handleDelete = async () => {
    await execute(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        console.log("Item deleted!");
      },
      {
        loadingMessage: "กำลังลบข้อมูล",
        loadingSubMessage: "การดำเนินการนี้ไม่สามารถย้อนกลับได้",
        onSuccess: () => alert("ลบข้อมูลสำเร็จ!"),
      },
    );
  };

  return (
    <div style={{ display: "flex", gap: 10 }}>
      <button onClick={handleSubmit} disabled={loading}>
        ส่งแบบฟอร์ม
      </button>
      <button onClick={handleDelete} disabled={loading}>
        ลบข้อมูล
      </button>
      {LoadingModal}
    </div>
  );
}

/**
 * Example 3: Error Handling with Loading Modal
 * Demonstrates how to handle errors gracefully
 */
export function ErrorHandlingExample() {
  const { loading, execute, LoadingModal, error } = useLoading({
    showLoadingModal: true,
    loadingMessage: "กำลังเชื่อมต่อ",
    onError: (err) => {
      setErrorMessage(err.message);
      // You can also show a toast notification here
      console.error("Error occurred:", err);
    },
  });

  const handleApiCall = async (shouldFail: boolean) => {
    try {
      await execute(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          if (shouldFail) {
            throw new Error("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
          }
          console.log("API call successful!");
        },
        {
          loadingMessage: shouldFail
            ? "กำลังพยายามเชื่อมต่อ..."
            : "กำลังดึงข้อมูล",
        },
      );
    } catch (err) {
      // Error already handled by onError callback
    }
  };

  return (
    <div>
      <button
        onClick={() => handleApiCall(false)}
        disabled={loading}
        style={{ marginRight: 10 }}
      >
        เรียก API สำเร็จ
      </button>
      <button onClick={() => handleApiCall(true)} disabled={loading}>
        เรียก API ล้มเหลว
      </button>

      {error && (
        <div
          style={{
            color: "#CC0001",
            marginTop: 10,
            padding: 10,
            background: "#fee",
          }}
        >
          ❌ {error.message}
        </div>
      )}

      {LoadingModal}
    </div>
  );
}

/**
 * Example 4: Simple Loading without Modal
 * Using useSimpleLoading for basic loading state without modal
 */
export function SimpleLoadingExample() {
  const { loading, execute } = useSimpleLoading();

  const handleClick = async () => {
    await execute(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      console.log("Done!");
    });
  };

  return (
    <button onClick={handleClick} disabled={loading}>
      {loading ? "กำลังโหลด..." : "คลิกเพื่อโหลด"}
    </button>
  );
}

/**
 * Example 5: Multiple Loading States
 * Tracking multiple independent operations
 */
export function MultiLoadingExample() {
  const { loading, setLoading, isLoading } = useMultiLoading({
    loadUser: false,
    loadPosts: false,
    loadSettings: false,
  });

  const loadAll = async () => {
    setLoading("loadUser", true);
    setLoading("loadPosts", true);
    setLoading("loadSettings", true);

    try {
      // Simulate loading with different durations
      await Promise.all([
        new Promise((resolve) =>
          setTimeout(() => {
            setLoading("loadUser", false);
            resolve(null);
          }, 1000),
        ),
        new Promise((resolve) =>
          setTimeout(() => {
            setLoading("loadPosts", false);
            resolve(null);
          }, 2000),
        ),
        new Promise((resolve) =>
          setTimeout(() => {
            setLoading("loadSettings", false);
            resolve(null);
          }, 1500),
        ),
      ]);
    } catch (err) {
      setLoading("loadUser", false);
      setLoading("loadPosts", false);
      setLoading("loadSettings", false);
    }
  };

  return (
    <div>
      <button onClick={loadAll} disabled={isLoading()}>
        {isLoading() ? "กำลังโหลดทั้งหมด..." : "โหลดข้อมูลทั้งหมด"}
      </button>

      <div style={{ marginTop: 20, display: "flex", gap: 20 }}>
        <div>ข้อมูลผู้ใช้: {loading.loadUser ? "⏳" : "✅"}</div>
        <div>โพสต์: {loading.loadPosts ? "⏳" : "✅"}</div>
        <div>ตั้งค่า: {loading.loadSettings ? "⏳" : "✅"}</div>
      </div>
    </div>
  );
}

/**
 * Example 6: Form Submission with Loading Modal
 * Practical example for form handling
 */
export function FormSubmissionExample() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: "",
  });
  const { loading, execute, LoadingModal } = useLoading({
    showLoadingModal: true,
    loadingMessage: "กำลังส่งข้อมูล",
    loadingSubMessage: "กรุณาอย่าปิดหน้าเว็บ",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    await execute(
      async () => {
        // Simulate form submission
        await new Promise((resolve) => setTimeout(resolve, 3000));
        console.log("Form submitted:", formData);
        return formData;
      },
      {
        loadingMessage: "กำลังตรวจสอบข้อมูล",
        loadingSubMessage: "กรุณารอสักครู่...",
        onSuccess: () => {
          alert("ส่งข้อมูลสำเร็จ!");
          setFormData({ name: "", email: "", message: "" });
        },
        onError: (err) => {
          alert("เกิดข้อผิดพลาด: " + err.message);
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 15 }}>
        <label style={{ display: "block", marginBottom: 5 }}>ชื่อ:</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          disabled={loading}
          style={{
            padding: 8,
            width: "100%",
            borderRadius: 8,
            border: "1px solid #ccc",
          }}
          required
        />
      </div>

      <div style={{ marginBottom: 15 }}>
        <label style={{ display: "block", marginBottom: 5 }}>อีเมล:</label>
        <input
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          disabled={loading}
          style={{
            padding: 8,
            width: "100%",
            borderRadius: 8,
            border: "1px solid #ccc",
          }}
          required
        />
      </div>

      <div style={{ marginBottom: 15 }}>
        <label style={{ display: "block", marginBottom: 5 }}>ข้อความ:</label>
        <textarea
          value={formData.message}
          onChange={(e) =>
            setFormData({ ...formData, message: e.target.value })
          }
          disabled={loading}
          style={{
            padding: 8,
            width: "100%",
            borderRadius: 8,
            border: "1px solid #ccc",
            minHeight: 100,
          }}
          required
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        style={{
          padding: "12px 24px",
          background: loading ? "#ccc" : "#CC0001",
          color: "white",
          border: "none",
          borderRadius: 8,
          fontSize: 16,
          fontWeight: "bold",
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "กำลังส่ง..." : "ส่งข้อมูล"}
      </button>

      {LoadingModal}
    </form>
  );
}

/**
 * Example 7: Chained Async Operations
 * Running multiple async operations in sequence
 */
export function ChainedOperationsExample() {
  const { loading, execute, LoadingModal } = useLoading({
    showLoadingModal: true,
    loadingMessage: "กำลังดำเนินการ",
  });

  const handleProcess = async () => {
    await execute(
      async () => {
        // Step 1: Validate
        await new Promise((resolve) => setTimeout(resolve, 1000));
        console.log("✓ Step 1: Validation complete");

        // Step 2: Process
        await new Promise((resolve) => setTimeout(resolve, 2000));
        console.log("✓ Step 2: Processing complete");

        // Step 3: Save
        await new Promise((resolve) => setTimeout(resolve, 1500));
        console.log("✓ Step 3: Saved successfully");
      },
      {
        loadingMessage: "กำลังประมวลผลข้อมูล",
        loadingSubMessage: "ขั้นตอนที่ 1/3: ตรวจสอบข้อมูล",
      },
    );
  };

  return (
    <div>
      <button onClick={handleProcess} disabled={loading}>
        {loading ? "กำลังประมวลผล..." : "เริ่มประมวลผล"}
      </button>
      {LoadingModal}
    </div>
  );
}

/**
 * Example 8: Data Fetching with Retry
 * Demonstrates loading with retry logic
 */
export function RetryExample() {
  const [attempts, setAttempts] = useState(0);
  const { loading, execute, LoadingModal } = useLoading({
    showLoadingModal: true,
    loadingMessage: "กำลังเชื่อมต่อ",
  });

  const handleFetch = async (shouldFail: boolean) => {
    setAttempts(0);

    await execute(
      async () => {
        for (let i = 1; i <= 3; i++) {
          setAttempts(i);
          await new Promise((resolve) => setTimeout(resolve, 1000));

          if (shouldFail && i < 3) {
            console.log(`Attempt ${i} failed, retrying...`);
            continue;
          }

          if (shouldFail && i === 3) {
            throw new Error("ไม่สามารถเชื่อมต่อได้หลังจากพยายาม 3 ครั้ง");
          }

          console.log("Success!");
          break;
        }
      },
      {
        loadingMessage: `กำลังพยายามเชื่อมต่อ (ครั้งที่ ${attempts}/3)`,
        loadingSubMessage:
          attempts > 0 ? "การเชื่อมต่อล้มเหลว กำลังลองใหม่..." : undefined,
      },
    );
  };

  return (
    <div>
      <button onClick={() => handleFetch(false)} disabled={loading}>
        ดึงข้อมูลสำเร็จ
      </button>
      <button onClick={() => handleFetch(true)} disabled={loading}>
        ดึงข้อมูลล้มเหลว
      </button>
      {LoadingModal}
    </div>
  );
}

/**
 * Example 9: Real-world Supabase Integration
 * Shows how to use LoadingModal with Supabase
 */
export function SupabaseExample() {
  const { loading, execute, LoadingModal, error } = useLoading({
    showLoadingModal: true,
    loadingMessage: "กำลังบันทึกข้อมูล",
    loadingSubMessage: "กำลังเชื่อมต่อกับฐานข้อมูล",
  });

  const handleSaveProfile = async () => {
    await execute(
      async () => {
        // Simulate Supabase operation
        // const supabase = createClient()
        // const { data, error } = await supabase
        //   .from('profiles')
        //   .update({ updated_at: new Date().toISOString() })
        //   .eq('id', userId)
        //   .select()

        // if (error) throw error

        // Simulate network delay
        await new Promise((resolve) => setTimeout(resolve, 2500));
        console.log("Profile saved successfully!");
        return { success: true };
      },
      {
        loadingMessage: "กำลังอัปเดตโปรไฟล์",
        loadingSubMessage: "กำลังบันทึกการเปลี่ยนแปลง",
        onSuccess: (result) => {
          console.log("Success:", result);
          // Show success toast
        },
        onError: (err) => {
          console.error("Failed to save profile:", err);
          // Show error toast
        },
      },
    );
  };

  return (
    <div>
      <button onClick={handleSaveProfile} disabled={loading}>
        {loading ? "กำลังบันทึก..." : "บันทึกโปรไฟล์"}
      </button>

      {error && (
        <div style={{ color: "#CC0001", marginTop: 10 }}>
          บันทึกล้มเหลว: {error.message}
        </div>
      )}

      {LoadingModal}
    </div>
  );
}

/**
 * Example 10: Component with Multiple Loading Actions
 * Shows how to handle multiple async actions in one component
 */
export function MultipleActionsExample() {
  const { loading, execute, LoadingModal } = useLoading({
    showLoadingModal: true,
    loadingMessage: "กำลังดำเนินการ",
  });

  const handleAction1 = async () => {
    await execute(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        console.log("Action 1 completed!");
      },
      { loadingMessage: "กำลังดำเนินการที่ 1" },
    );
  };

  const handleAction2 = async () => {
    await execute(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        console.log("Action 2 completed!");
      },
      { loadingMessage: "กำลังดำเนินการที่ 2" },
    );
  };

  const handleAction3 = async () => {
    await execute(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        console.log("Action 3 completed!");
      },
      { loadingMessage: "กำลังดำเนินการที่ 3" },
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <button onClick={handleAction1} disabled={loading}>
        การดำเนินการที่ 1
      </button>
      <button onClick={handleAction2} disabled={loading}>
        การดำเนินการที่ 2
      </button>
      <button onClick={handleAction3} disabled={loading}>
        การดำเนินการที่ 3
      </button>
      {LoadingModal}
    </div>
  );
}
