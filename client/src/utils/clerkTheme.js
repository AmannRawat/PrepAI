/**
 * Clerk Theme & Appearance Configuration for PrepAI
 * Aligns Clerk's auth components (<SignIn />, <SignUp />) with PrepAI's dark charcoal + emerald design system.
 * Eliminates nested card borders and awkward spacing while preserving standard Clerk authentication behavior.
 */

export const getClerkAppearance = () => {
    return {
        variables: {
            colorPrimary: "#10b981",          // Emerald 500
            colorPrimaryForeground: "#090b0e",
            colorBackground: "transparent",
            colorForeground: "#f1f5f9",       // Crisp text-primary
            colorMutedForeground: "#94a3b8",  // Slate text-secondary
            colorInputBackground: "#090b0e",  // Deep near-black background
            colorInputText: "#f1f5f9",
            colorBorder: "rgba(255, 255, 255, 0.12)",
            colorRing: "#10b981",
            fontFamily: "Inter, system-ui, -apple-system, sans-serif",
            borderRadius: "0.75rem",          // 12px
            fontSize: "0.875rem",
        },
        elements: {
            rootBox: {
                width: "100%",
            },
            cardBox: {
                width: "100%",
                boxShadow: "none",
                overflow: "visible",
            },
            card: {
                width: "100%",
                backgroundColor: "transparent",
                boxShadow: "none",
                border: "none",
                padding: "0.5rem 0 0 0", // Headroom for the "Last used" badge
                margin: "0",
                overflow: "visible",
            },
            header: {
                display: "none", // Replaced by custom branded welcome header with Pepe avatar & tagline
            },
            headerTitle: {
                display: "none",
            },
            headerSubtitle: {
                display: "none",
            },
            socialButtonsRoot: {
                overflow: "visible",
            },
            socialButtons: {
                overflow: "visible",
            },
            socialButtonsBlockButton: {
                backgroundColor: "#090b0e",
                color: "#f1f5f9",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                height: "44px",
                borderRadius: "0.75rem",
                fontSize: "0.875rem",
                fontWeight: "500",
                transition: "all 0.15s ease",
                overflow: "visible",
            },
            socialButtonsBlockButtonText: {
                color: "#f1f5f9",
                fontWeight: "500",
                fontSize: "0.875rem",
            },
            socialButtonsBlockButtonBadge: {
                backgroundColor: "#181d24",
                color: "#f1f5f9",
                border: "1px solid rgba(255, 255, 255, 0.16)",
                fontSize: "0.6875rem",
                fontWeight: "500",
                borderRadius: "9999px",
                padding: "2px 8px",
                overflow: "visible",
                zIndex: 10,
            },
            socialButtonsBlockButtonBadge__lastUsed: {
                backgroundColor: "#181d24",
                color: "#f1f5f9",
                border: "1px solid rgba(255, 255, 255, 0.16)",
                overflow: "visible",
            },
            dividerRow: {
                margin: "0.625rem 0", // Reduced space at OR section
            },
            dividerLine: {
                backgroundColor: "rgba(255, 255, 255, 0.1)",
            },
            dividerText: {
                color: "#94a3b8",
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                fontWeight: "600",
            },
            formField: {
                marginBottom: "0.5rem", // Reduced space below OR line
            },
            formFieldLabel: {
                color: "#94a3b8",
                fontSize: "0.75rem",
                fontWeight: "500",
                marginBottom: "0.25rem",
            },
            formFieldInput: {
                backgroundColor: "#090b0e",
                color: "#f1f5f9",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: "0.75rem",
                height: "40px", // Compact input height
                padding: "0 0.875rem",
                fontSize: "0.875rem",
                transition: "border-color 0.15s ease, box-shadow 0.15s ease",
            },
            formButtonPrimary: {
                backgroundColor: "#10b981",
                color: "#090b0e",
                fontWeight: "600",
                fontSize: "0.875rem",
                borderRadius: "0.75rem",
                height: "40px", // Compact button height
                boxShadow: "0 4px 14px rgba(16, 185, 129, 0.25)",
                transition: "all 0.15s ease",
                marginTop: "0.375rem",
            },
            footer: {
                backgroundColor: "transparent",
                border: "none",
                padding: "0",
                marginTop: "0.625rem", // Reduced footer margin
            },
            footerAction: {
                backgroundColor: "transparent",
                border: "none",
                padding: "0",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: "0.375rem",
                fontSize: "0.75rem",
            },
            footerActionText: {
                color: "#94a3b8",
                fontSize: "0.75rem",
            },
            footerActionLink: {
                color: "#10b981",
                fontWeight: "600",
                fontSize: "0.75rem",
                textDecoration: "none",
                transition: "color 0.15s ease",
            },
            footerPages: {
                marginTop: "0.375rem",
                paddingTop: "0.25rem",
                borderTop: "1px solid rgba(255, 255, 255, 0.06)",
            },
            footerPagesLink: {
                color: "rgba(148, 163, 184, 0.6)",
                fontSize: "0.6875rem",
            },
            identityPreview: {
                backgroundColor: "#090b0e",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: "0.75rem",
            },
            identityPreviewText: {
                color: "#f1f5f9",
                fontSize: "0.8125rem",
            },
            identityPreviewEditButton: {
                color: "#10b981",
                fontWeight: "500",
            },
            otpCodeFieldInput: {
                backgroundColor: "#090b0e",
                color: "#f1f5f9",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: "0.75rem",
            },
            formFieldErrorText: {
                color: "#f87171",
                fontSize: "0.75rem",
                marginTop: "0.25rem",
            },
            alert: {
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#f87171",
                borderRadius: "0.75rem",
            },
            alertText: {
                color: "#f87171",
                fontSize: "0.75rem",
            },
        },
    };
};
