import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useUser, SignIn, SignUp } from "@stackframe/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Thermometer } from "lucide-react";
import { Link } from "react-router-dom";

const Auth = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const user = useUser();
  const mode = searchParams.get("mode") === "signup" ? "signup" : "signin";

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (user) {
      navigate("/auth/callback", { replace: true });
    }
  }, [user, navigate]);

  // If already authenticated, show nothing while redirecting
  if (user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-frost flex flex-col items-center justify-center p-4">
      <Link to="/" className="flex items-center gap-2 mb-8">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-primary flex items-center justify-center">
          <Thermometer className="w-6 h-6 text-white" />
        </div>
        <span className="text-2xl font-bold text-foreground">FrostGuard</span>
      </Link>

      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome</CardTitle>
          <CardDescription>
            Sign in to your account or create a new one
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={mode}>
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <SignIn
                afterSignIn="/auth/callback"
              />
            </TabsContent>

            <TabsContent value="signup">
              <SignUp
                afterSignUp="/auth/callback"
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
