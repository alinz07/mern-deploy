// client/src/pages/CheckPage.js
import React, { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import axios from "axios";

export default function CheckPage() {
  const { dayId } = useParams();
  const [searchParams] = useSearchParams();
  const monthId = searchParams.get("monthId");

  const [check, setCheck] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState({}); // e.g. { checkone: true }

  const tokenHeader = () => ({
    headers: { "x-auth-token": localStorage.getItem("token") },
  });

  // Ensure a Check exists for (dayId, user) and load it
  useEffect(() => {
    const run = async () => {
      try {
        const createRes = await axios.post(
          "https://mern-deploy-i7u8.onrender.com/api/checks",
          { dayId },
          tokenHeader()
        );
        setCheck(createRes.data);
      } catch (err) {
        const m =
          err.response?.data?.msg ||
          err.response?.data?.error ||
          "Unable to load or create check";
        setMsg(m);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [dayId]);

  const toggleField = useCallback(
    async (field) => {
      if (!check || saving[field]) return;

      // mark saving and do optimistic update
      setSaving((s) => ({ ...s, [field]: true }));
      const prev = check[field];
      setCheck((c) => ({ ...c, [field]: !prev }));

      try {
        const res = await axios.p
