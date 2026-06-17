package util 
{
	/**
	 * ...
	 * @author S
	 */
	public class AvatarDebugger
	{
		
		public function AvatarDebugger() {
			
		}
		
		public static function log(log:String):void {
			trace("[LOG]: " + log);
		}
		
		public static function debug(debug:String):void {
			trace("[DEBUG]: " + debug);
		}
		
		public static function error(error:String):void {
			trace("[ERROR]: " + error);
		}
		
	}
}