package util
{
	import flash.utils.ByteArray;
	/**
	 * ...
	 * @author S
	 */
	public class AvatarXMLProvider
	{
		[Embed(source="../../lib/xml/avatar_default.xml", mimeType="application/octet-stream")]
		private var defaultXMLFile:Class;
		
		public var xml:XML;
		
		public function AvatarXMLProvider() {
			var xmlString:String = new defaultXMLFile();
			
			xml = new XML(xmlString);
		}
		
	}
}